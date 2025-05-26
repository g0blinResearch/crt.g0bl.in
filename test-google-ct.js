#!/usr/bin/env node

/**
 * Test script for Google CT Provider
 * Tests the Google Certificate Transparency log streaming functionality
 */

const { createProvider } = require('./src/providers/provider-factory');
const { createLogger } = require('./src/lib/logger');

// Create a logger instance
const logger = createLogger({ logLevel: 'info' });

async function testGoogleCT() {
    console.log('🔍 Testing Google CT Provider...\n');
    
    try {
        // Create Google CT provider with configuration
        const provider = createProvider('google-ct', {
            pollInterval: 10000, // 10 seconds for testing
            batchSize: 25, // Moderate batch for testing
            logs: [
                'https://ct.googleapis.com/logs/us1/argon2025h1/', // Current Google CT log
            ]
        }, logger);

        let certificateCount = 0;
        const maxCertificates = 10; // Stop after 10 certificates for testing

        // Set up event handlers
        provider.on('connected', () => {
            console.log('✅ Connected to Google CT logs');
        });

        provider.on('certificate', (certificate) => {
            certificateCount++;
            console.log(`\n📜 Certificate #${certificateCount}:`);
            console.log(`   Index: ${certificate.data.cert_index}`);
            console.log(`   Common Name: ${certificate.data.leaf_cert.subject.CN}`);
            console.log(`   Domains: ${certificate.data.leaf_cert.extensions.subjectAltName.slice(0, 3).join(', ')}${certificate.data.leaf_cert.extensions.subjectAltName.length > 3 ? '...' : ''}`);
            console.log(`   Issuer: ${certificate.data.leaf_cert.issuer.CN}`);
            console.log(`   Source: ${certificate.data.source.name} (${certificate.data.source.url})`);
            console.log(`   Seen: ${new Date(certificate.data.seen * 1000).toISOString()}`);

            if (certificateCount >= maxCertificates) {
                console.log(`\n🎯 Reached ${maxCertificates} certificates, stopping test...`);
                provider.disconnect();
            }
        });

        provider.on('error', (error) => {
            console.error('❌ Provider error:', error.message);
        });

        provider.on('disconnected', () => {
            console.log('\n🔌 Disconnected from Google CT logs');
            console.log(`\n📊 Test Summary:`);
            console.log(`   Total certificates received: ${certificateCount}`);
            console.log(`   Provider: Google CT`);
            
            if (certificateCount > 0) {
                console.log('\n✅ Google CT Provider test completed successfully!');
            } else {
                console.log('\n⚠️  No certificates received - this might be normal if no new certificates were issued during the test period');
            }
            
            process.exit(0);
        });

        // Connect to the provider
        console.log('🔗 Connecting to Google CT logs...');
        await provider.connect();

        // Set a timeout to stop the test if no certificates are received
        setTimeout(() => {
            if (certificateCount === 0) {
                console.log('\n⏰ Test timeout reached with no certificates received');
                console.log('   This is normal - Google CT logs may not have new certificates during the test period');
                provider.disconnect();
            }
        }, 60000); // 1 minute timeout

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Test terminated');
    process.exit(0);
});

// Run the test
testGoogleCT().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});