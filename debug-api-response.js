#!/usr/bin/env node

/**
 * Debug script to see what the Google CT API actually returns
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

async function debugApiResponse() {
    try {
        const logUrl = 'https://ct.googleapis.com/logs/us1/argon2025h1/';
        
        console.log('🔍 Getting current tree head...');
        const sth = await getSignedTreeHead(logUrl);
        console.log('Tree size:', sth.tree_size);
        
        // Get the latest few entries
        const start = sth.tree_size - 3;
        const end = sth.tree_size - 1;
        
        console.log(`\n📡 Fetching entries ${start} to ${end}...`);
        const response = await getEntries(logUrl, start, end);
        
        console.log('\n🔍 Raw API Response Structure:');
        console.log('Response keys:', Object.keys(response));
        
        if (response.entries && response.entries.length > 0) {
            console.log('\n📜 First Entry Structure:');
            const firstEntry = response.entries[0];
            console.log('Entry keys:', Object.keys(firstEntry));
            
            console.log('\n📋 Entry Details:');
            console.log('- leaf_input length:', firstEntry.leaf_input ? firstEntry.leaf_input.length : 'N/A');
            console.log('- extra_data length:', firstEntry.extra_data ? firstEntry.extra_data.length : 'N/A');
            
            // Try to decode the leaf_input to see what's in there
            if (firstEntry.leaf_input) {
                console.log('\n🔍 Decoded leaf_input (first 200 chars):');
                const leafBuffer = Buffer.from(firstEntry.leaf_input, 'base64');
                console.log('Buffer length:', leafBuffer.length);
                console.log('As string (first 200 chars):', leafBuffer.toString('binary').substring(0, 200));
                console.log('As hex (first 100 bytes):', leafBuffer.subarray(0, 100).toString('hex'));
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugApiResponse();