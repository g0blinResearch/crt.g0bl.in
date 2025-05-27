#!/usr/bin/env node

/**
 * Debug script to understand the CT log entry structure
 */

const https = require('https');

async function getEntries(logUrl, start, end) {
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

async function getSignedTreeHead(logUrl) {
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

function debugCertificateStructure(leafInput) {
    console.log('\n🔍 Analyzing CT log entry structure...');
    
    const leafBuffer = Buffer.from(leafInput, 'base64');
    console.log('Total leaf_input length:', leafBuffer.length);
    
    // CT log entry structure according to RFC 6962
    // 0: version (1 byte)
    // 1: leaf_type (1 byte) 
    // 2-9: timestamp (8 bytes)
    // 10: entry_type (2 bytes)
    // 12+: certificate data
    
    if (leafBuffer.length < 12) {
        console.log('❌ Buffer too short for CT log entry');
        return null;
    }
    
    const version = leafBuffer[0];
    const leafType = leafBuffer[1];
    const timestamp = leafBuffer.readBigUInt64BE(2);
    const entryType = leafBuffer.readUInt16BE(10);
    
    console.log('Version:', version);
    console.log('Leaf type:', leafType);
    console.log('Timestamp:', timestamp);
    console.log('Entry type:', entryType);
    
    // For X509 certificates, entry_type should be 0
    if (entryType === 0) {
        console.log('✅ This is an X.509 certificate entry');
        
        // Certificate length is next 3 bytes (24-bit big endian)
        if (leafBuffer.length < 15) {
            console.log('❌ Buffer too short for certificate length');
            return null;
        }
        
        const certLength = (leafBuffer[12] << 16) | (leafBuffer[13] << 8) | leafBuffer[14];
        console.log('Certificate length:', certLength);
        
        // Extract certificate data
        const certStart = 15;
        const certEnd = certStart + certLength;
        
        if (leafBuffer.length < certEnd) {
            console.log('❌ Buffer too short for certificate data');
            console.log('Expected end:', certEnd, 'Actual length:', leafBuffer.length);
            return null;
        }
        
        const certData = leafBuffer.subarray(certStart, certEnd);
        console.log('Extracted certificate data length:', certData.length);
        
        return certData;
    } else {
        console.log('❌ Not an X.509 certificate entry (entry_type:', entryType, ')');
        return null;
    }
}

function extractDomainsFromCertData(certData) {
    console.log('\n🔍 Extracting domains using simple string parsing...');
    
    try {
        // Convert to string and look for domain patterns
        const certStr = certData.toString('binary');
        
        // Look for domain patterns (simplified approach)
        const domainRegex = /([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/g;
        const matches = certStr.match(domainRegex);
        
        if (matches) {
            const domains = [];
            for (const match of matches) {
                // Basic validation
                if (isValidDomain(match)) {
                    domains.push(match);
                }
            }
            
            // Remove duplicates and return
            const uniqueDomains = [...new Set(domains)].sort();
            console.log('✅ Found domains:', uniqueDomains);
            return uniqueDomains;
        }
        
        console.log('❌ No domains found');
        return [];
        
    } catch (error) {
        console.log('❌ Error extracting domains:', error.message);
        return [];
    }
}

function isValidDomain(domain) {
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
    
    return true;
}

async function debugCertificateParsing() {
    try {
        const logUrl = 'https://ct.googleapis.com/logs/us1/argon2025h1/';
        
        console.log('🔍 Getting current tree head...');
        const sth = await getSignedTreeHead(logUrl);
        console.log('Tree size:', sth.tree_size);
        
        // Get one entry
        const start = sth.tree_size - 1;
        const end = sth.tree_size - 1;
        
        console.log(`\n📡 Fetching entry ${start}...`);
        const response = await getEntries(logUrl, start, end);
        
        if (response.entries && response.entries.length > 0) {
            const entry = response.entries[0];
            console.log('Entry keys:', Object.keys(entry));
            
            const certData = debugCertificateStructure(entry.leaf_input);
            
            if (certData) {
                const domains = extractDomainsFromCertData(certData);
                
                if (domains.length > 0) {
                    console.log('\n🎉 Successfully extracted domains using simple parsing!');
                    console.log('Domains found:', domains);
                } else {
                    console.log('\n⚠️ No domains found with simple parsing');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugCertificateParsing();