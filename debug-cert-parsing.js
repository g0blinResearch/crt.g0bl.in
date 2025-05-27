#!/usr/bin/env node

/**
 * Debug script to understand the CT log entry structure
 */

const https = require('https');
const forge = require('node-forge');

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

function testForgeParsingMethods(certData) {
    console.log('\n🧪 Testing different node-forge parsing methods...');
    
    // Method 1: Direct DER parsing
    try {
        console.log('Method 1: Direct DER parsing...');
        const certDer = forge.util.createBuffer(certData);
        const asn1 = forge.asn1.fromDer(certDer);
        const cert = forge.pki.certificateFromAsn1(asn1);
        console.log('✅ Method 1 SUCCESS');
        console.log('Subject CN:', cert.subject.getField('CN')?.value);
        console.log('Issuer CN:', cert.issuer.getField('CN')?.value);
        return cert;
    } catch (error) {
        console.log('❌ Method 1 FAILED:', error.message);
    }
    
    // Method 2: PEM conversion first
    try {
        console.log('Method 2: PEM conversion...');
        const certPem = forge.pki.certificateToPem(forge.pki.certificateFromDer(forge.util.encode64(certData)));
        const cert = forge.pki.certificateFromPem(certPem);
        console.log('✅ Method 2 SUCCESS');
        return cert;
    } catch (error) {
        console.log('❌ Method 2 FAILED:', error.message);
    }
    
    // Method 3: Try as raw binary
    try {
        console.log('Method 3: Raw binary...');
        const cert = forge.pki.certificateFromDer(forge.util.createBuffer(certData, 'raw'));
        console.log('✅ Method 3 SUCCESS');
        return cert;
    } catch (error) {
        console.log('❌ Method 3 FAILED:', error.message);
    }
    
    return null;
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
                const cert = testForgeParsingMethods(certData);
                
                if (cert) {
                    console.log('\n🎉 Successfully parsed certificate!');
                    console.log('Subject:', cert.subject.attributes.map(attr => `${attr.shortName}=${attr.value}`).join(', '));
                    console.log('Issuer:', cert.issuer.attributes.map(attr => `${attr.shortName}=${attr.value}`).join(', '));
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugCertificateParsing();