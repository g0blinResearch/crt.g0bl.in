const BaseProvider = require('./base-provider');
const https = require('https');
const { URL } = require('url');
const forge = require('node-forge');

/**
 * Google Certificate Transparency Log Provider
 * Streams certificates from Google's CT logs using their REST API
 */
class GoogleCTProvider extends BaseProvider {
    constructor(options = {}) {
        super(options);
        
        this.name = 'google-ct-provider';
        
        // Default Google CT logs (active ones for 2025)
        this.logs = options.logs || [
            'https://ct.googleapis.com/logs/us1/argon2025h1/',
            'https://ct.googleapis.com/logs/us1/argon2025h2/',
            'https://ct.googleapis.com/logs/us1/argon2026h1/'
        ];
        
        this.pollInterval = options.pollInterval || 5000; // 5 seconds
        this.batchSize = options.batchSize || 50; // Number of entries to fetch per request
        this.maxRetries = options.maxRetries || 3;
        
        // Track the latest entry index for each log
        this.logStates = new Map();
        this.pollTimers = new Map();
    }

    async connect() {
        if (this.isConnected) {
            return;
        }

        this.logger.info('Connecting to Google CT logs...');
        
        try {
            // Initialize each log by getting its current tree head
            for (const logUrl of this.logs) {
                await this.initializeLog(logUrl);
            }
            
            this.isConnected = true;
            this.emit('connected');
            this.logger.info(`Connected to ${this.logs.length} Google CT logs`);
            
            // Start polling each log
            this.startPolling();
            
        } catch (error) {
            this.logger.error('Failed to connect to Google CT logs:', error);
            this.emit('error', error);
            throw error;
        }
    }

    async initializeLog(logUrl) {
        try {
            const sth = await this.getSignedTreeHead(logUrl);
            const treeSize = sth.tree_size;
            
            // Start from recent entries (last 100 or so)
            const startIndex = Math.max(0, treeSize - 100);
            
            this.logStates.set(logUrl, {
                treeSize: treeSize,
                lastProcessedIndex: startIndex,
                consecutiveErrors: 0
            });
            
            this.logger.info(`Initialized log ${logUrl}: tree_size=${treeSize}, starting from index=${startIndex}`);
            
        } catch (error) {
            this.logger.error(`Failed to initialize log ${logUrl}:`, error);
            throw error;
        }
    }

    async getSignedTreeHead(logUrl) {
        return new Promise((resolve, reject) => {
            const url = new URL('ct/v1/get-sth', logUrl);
            
            const req = https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            return;
                        }
                        
                        const sth = JSON.parse(data);
                        resolve(sth);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    async getEntries(logUrl, start, end) {
        return new Promise((resolve, reject) => {
            const url = new URL(`ct/v1/get-entries?start=${start}&end=${end}`, logUrl);
            
            const req = https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            return;
                        }
                        
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            req.on('error', reject);
            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    startPolling() {
        for (const logUrl of this.logs) {
            const timer = setInterval(() => {
                this.pollLog(logUrl).catch(error => {
                    this.logger.error(`Error polling log ${logUrl}:`, error);
                });
            }, this.pollInterval);
            
            this.pollTimers.set(logUrl, timer);
        }
    }

    async pollLog(logUrl) {
        if (!this.isConnected) {
            return;
        }

        const state = this.logStates.get(logUrl);
        if (!state) {
            return;
        }

        try {
            // Get current tree head to check for new entries
            const sth = await this.getSignedTreeHead(logUrl);
            const currentTreeSize = sth.tree_size;
            
            if (currentTreeSize <= state.lastProcessedIndex) {
                // No new entries
                return;
            }

            // Calculate range to fetch
            const start = state.lastProcessedIndex + 1;
            const end = Math.min(start + this.batchSize - 1, currentTreeSize - 1);
            
            // Fetch new entries
            const response = await this.getEntries(logUrl, start, end);
            
            if (response.entries && response.entries.length > 0) {
                // Process each entry
                for (let i = 0; i < response.entries.length; i++) {
                    const entry = response.entries[i];
                    const index = start + i;
                    
                    try {
                        const certificate = this.parseLogEntry(entry, logUrl, index);
                        if (certificate) {
                            this.emit('certificate', certificate);
                        }
                    } catch (parseError) {
                        this.logger.warn(`Failed to parse entry ${index} from ${logUrl}:`, parseError.message);
                    }
                }
                
                // Update state
                state.lastProcessedIndex = end;
                state.treeSize = currentTreeSize;
                state.consecutiveErrors = 0;
                
                this.logger.debug(`Processed entries ${start}-${end} from ${logUrl}`);
            }
            
        } catch (error) {
            state.consecutiveErrors++;
            this.logger.error(`Error polling log ${logUrl} (${state.consecutiveErrors} consecutive errors):`, error);
            
            // If too many consecutive errors, pause this log temporarily
            if (state.consecutiveErrors >= this.maxRetries) {
                this.logger.warn(`Pausing log ${logUrl} due to consecutive errors`);
                const timer = this.pollTimers.get(logUrl);
                if (timer) {
                    clearInterval(timer);
                    this.pollTimers.delete(logUrl);
                }
                
                // Retry after a longer delay
                setTimeout(() => {
                    if (this.isConnected) {
                        state.consecutiveErrors = 0;
                        this.startPollingLog(logUrl);
                    }
                }, 60000); // 1 minute
            }
        }
    }

    startPollingLog(logUrl) {
        const timer = setInterval(() => {
            this.pollLog(logUrl).catch(error => {
                this.logger.error(`Error polling log ${logUrl}:`, error);
            });
        }, this.pollInterval);
        
        this.pollTimers.set(logUrl, timer);
    }

    parseLogEntry(entry, logUrl, index) {
        try {
            // Decode the leaf input (base64 encoded)
            const leafInput = Buffer.from(entry.leaf_input, 'base64');
            
            // Parse the certificate from the leaf input
            // The format is complex, but we can extract basic info
            const certificate = this.extractCertificateInfo(leafInput, entry.extra_data);
            
            if (certificate) {
                return {
                    message_type: 'certificate_update',
                    data: {
                        cert_index: index,
                        cert_link: `${logUrl}ct/v1/get-entries?start=${index}&end=${index}`,
                        leaf_cert: {
                            subject: {
                                CN: certificate.commonName || 'Unknown'
                            },
                            extensions: {
                                subjectAltName: certificate.domains || []
                            },
                            issuer: {
                                CN: certificate.issuer || 'Unknown'
                            },
                            not_before: certificate.notBefore || new Date().toISOString(),
                            not_after: certificate.notAfter || new Date(Date.now() + 365*24*60*60*1000).toISOString(),
                            all_domains: certificate.domains || []
                        },
                        chain: [],
                        seen: Date.now() / 1000,
                        source: {
                            url: logUrl,
                            name: 'Google CT'
                        }
                    }
                };
            }
            
        } catch (error) {
            this.logger.warn(`Failed to parse certificate entry:`, error.message);
        }
        
        return null;
    }

    extractCertificateInfo(leafInput, extraData) {
        try {
            // CT log entry structure (RFC 6962):
            // 0: version (1 byte)
            // 1: leaf_type (1 byte)
            // 2-9: timestamp (8 bytes)
            // 10-11: entry_type (2 bytes)
            // 12-14: certificate length (3 bytes, big endian)
            // 15+: certificate data
            
            if (leafInput.length < 15) {
                return null;
            }
            
            // Read certificate length (3 bytes, big endian, starting at byte 12)
            const certLength = (leafInput[12] << 16) | (leafInput[13] << 8) | leafInput[14];
            
            // Extract the certificate data starting at byte 15
            const certStart = 15;
            const certEnd = certStart + certLength;
            
            if (leafInput.length < certEnd) {
                return null;
            }
            
            const certData = leafInput.subarray(certStart, certEnd);
            
            // Parse the certificate using node-forge
            try {
                const certDer = forge.util.createBuffer(certData);
                const asn1 = forge.asn1.fromDer(certDer);
                const cert = forge.pki.certificateFromAsn1(asn1);
                
                // Extract domains from Subject Alternative Names
                const domains = [];
                
                // Add Common Name if present
                const commonName = cert.subject.getField('CN');
                if (commonName) {
                    domains.push(commonName.value);
                }
                
                // Add SAN domains
                const sanExtension = cert.getExtension('subjectAltName');
                if (sanExtension) {
                    sanExtension.altNames.forEach(altName => {
                        if (altName.type === 2) { // DNS name
                            domains.push(altName.value);
                        }
                    });
                }
                
                // Remove duplicates
                const uniqueDomains = [...new Set(domains)];
                
                if (uniqueDomains.length > 0) {
                    // Extract issuer Common Name
                    const issuerCN = cert.issuer.getField('CN');
                    const issuer = issuerCN ? issuerCN.value : 'Unknown';
                    
                    return {
                        commonName: uniqueDomains[0],
                        domains: uniqueDomains,
                        issuer: issuer,
                        notBefore: cert.validity.notBefore.toISOString(),
                        notAfter: cert.validity.notAfter.toISOString()
                    };
                }
                
            } catch (forgeError) {
                this.logger.warn('Failed to parse certificate with node-forge:', forgeError.message);
                // Fallback to basic parsing
                return this.extractCertificateInfoFallback(leafInput, extraData);
            }
            
            return null;
            
        } catch (error) {
            this.logger.warn('Failed to extract certificate info:', error.message);
            return null;
        }
    }

    extractCertificateInfoFallback(leafInput, extraData) {
        // Fallback method - try to parse the certificate data directly if the main parsing failed
        try {
            // First try to parse the raw leafInput as a certificate (some CT logs might have different formats)
            try {
                const certDer = forge.util.createBuffer(leafInput);
                const asn1 = forge.asn1.fromDer(certDer);
                const cert = forge.pki.certificateFromAsn1(asn1);
                
                // Extract domains
                const domains = [];
                const commonName = cert.subject.getField('CN');
                if (commonName) {
                    domains.push(commonName.value);
                }
                
                const sanExtension = cert.getExtension('subjectAltName');
                if (sanExtension) {
                    sanExtension.altNames.forEach(altName => {
                        if (altName.type === 2) { // DNS name
                            domains.push(altName.value);
                        }
                    });
                }
                
                const uniqueDomains = [...new Set(domains)];
                
                if (uniqueDomains.length > 0) {
                    const issuerCN = cert.issuer.getField('CN');
                    const issuer = issuerCN ? issuerCN.value : 'Unknown';
                    
                    return {
                        commonName: uniqueDomains[0],
                        domains: uniqueDomains,
                        issuer: issuer,
                        notBefore: cert.validity.notBefore.toISOString(),
                        notAfter: cert.validity.notAfter.toISOString()
                    };
                }
            } catch (directParseError) {
                // If direct parsing fails, fall back to string-based domain extraction
                const leafStr = leafInput.toString('binary');
                const extraStr = extraData ? Buffer.from(extraData, 'base64').toString('binary') : '';
                const combinedData = leafStr + extraStr;
                
                const domains = this.extractDomains(combinedData);
                
                if (domains.length > 0) {
                    return {
                        commonName: domains[0],
                        domains: domains,
                        issuer: 'Unknown', // Don't use string matching for issuer
                        notBefore: new Date().toISOString(),
                        notAfter: new Date(Date.now() + 365*24*60*60*1000).toISOString()
                    };
                }
            }
        } catch (error) {
            // Ignore parsing errors
        }
        
        return null;
    }

    extractDomains(certData) {
        const domains = [];
        
        // Look for domain patterns (simplified approach)
        const domainRegex = /([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/g;
        const matches = certData.match(domainRegex);
        
        if (matches) {
            for (const match of matches) {
                // Filter out obvious non-domains
                if (this.isValidDomain(match)) {
                    domains.push(match);
                }
            }
        }
        
        // Remove duplicates and sort
        return [...new Set(domains)].sort();
    }

    isValidDomain(domain) {
        // Basic length and format checks
        if (!domain || domain.length < 4 || domain.length > 253) {
            return false;
        }
        
        // Must contain at least one dot
        if (!domain.includes('.')) {
            return false;
        }
        
        // Filter out obvious non-domains
        if (domain.includes('..') ||
            domain.startsWith('.') ||
            domain.endsWith('.') ||
            domain.includes('\\') ||
            domain.includes(' ')) {
            return false;
        }
        
        // Filter out file extensions that are not domains
        const invalidExtensions = [
            '.crl', '.cer', '.crt', '.pem', '.der', '.p7b', '.p7c', '.p12', '.pfx',
            '.key', '.pub', '.bin', '.txt', '.log', '.xml', '.json', '.html', '.htm'
        ];
        
        for (const ext of invalidExtensions) {
            if (domain.toLowerCase().endsWith(ext)) {
                return false;
            }
        }
        
        // Filter out numeric-only subdomains (like "13.crl")
        const parts = domain.split('.');
        if (parts.length === 2 && /^\d+$/.test(parts[0])) {
            return false;
        }
        
        // Must have a valid TLD (at least 2 characters, not all numbers)
        const tld = parts[parts.length - 1];
        if (tld.length < 2 || /^\d+$/.test(tld)) {
            return false;
        }
        
        // Filter out domains that look like internal certificate identifiers
        if (/^[A-Za-z0-9+\/=]+\.(crl|cer|crt)$/i.test(domain)) {
            return false;
        }
        
        return true;
    }


    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        this.logger.info('Disconnecting from Google CT logs...');
        
        // Clear all polling timers
        for (const timer of this.pollTimers.values()) {
            clearInterval(timer);
        }
        this.pollTimers.clear();
        
        this.isConnected = false;
        this.emit('disconnected');
        this.logger.info('Disconnected from Google CT logs');
    }

    getStats() {
        const stats = {
            connected: this.isConnected,
            logs: this.logs.length,
            logStates: {}
        };
        
        for (const [logUrl, state] of this.logStates) {
            stats.logStates[logUrl] = {
                treeSize: state.treeSize,
                lastProcessedIndex: state.lastProcessedIndex,
                consecutiveErrors: state.consecutiveErrors
            };
        }
        
        return stats;
    }
}

module.exports = GoogleCTProvider;