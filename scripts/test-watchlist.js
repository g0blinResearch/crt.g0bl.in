#!/usr/bin/env node
/**
 * Domain Watchlist Module Test
 * 
 * This script tests the Domain Watchlist module without requiring an actual
 * connection to CT logs. It generates test certificates with domains that 
 * should trigger watchlist alerts.
 */

// Import the Domain Watchlist module
const DomainWatchlist = require('../modules/domain-watchlist');

// Mock logger
const logger = {
  info: console.log,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
  success: console.log
};

// Create module configuration
const config = {
  domains: [
    'example.com',
    'testdomain.org',
    'mycompany.com'
  ],
  watchForSimilar: true,
  alertThreshold: 1
};

// Generate a test certificate
function generateTestCertificate(domain, issuerId = 1) {
  return {
    message_type: 'certificate_update',
    data: {
      update_type: 'X509LogEntry',
      leaf_cert: {
        subject: {
          CN: domain
        },
        issuer: {
          CN: `Test CA ${issuerId}`,
          O: 'Test Certificate Authority'
        },
        not_before: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        not_after: new Date(Date.now() + 86400000 * 90).toISOString(), // 90 days from now
        fingerprint: `fp_${domain}_${issuerId}_${Date.now()}`,
        extensions: {
          subjectAltName: `DNS:${domain}, DNS:www.${domain}, DNS:mail.${domain}`
        }
      }
    }
  };
}

// Run the test
async function runTest() {
  console.log('=== Domain Watchlist Module Test ===\n');
  
  // Create module instance
  const watchlist = new DomainWatchlist(config, logger);
  
  // Initialize the module
  await watchlist.initialize();
  
  console.log('\n--- Test Cases ---\n');
  
  // Test Case 1: Exact Match
  console.log('Test Case 1: Exact Domain Match');
  const cert1 = generateTestCertificate('example.com');
  const result1 = await watchlist.process(cert1);
  console.log('Result:', JSON.stringify(result1, null, 2));
  console.log('\n--------------------------\n');
  
  // Test Case 2: Subdomain Match
  console.log('Test Case 2: Subdomain Match');
  const cert2 = generateTestCertificate('blog.mycompany.com');
  const result2 = await watchlist.process(cert2);
  console.log('Result:', JSON.stringify(result2, null, 2));
  console.log('\n--------------------------\n');
  
  // Test Case 3: No Match
  console.log('Test Case 3: No Match');
  const cert3 = generateTestCertificate('unrelated-domain.net');
  const result3 = await watchlist.process(cert3);
  console.log('Result:', JSON.stringify(result3, null, 2));
  console.log('\n--------------------------\n');
  
  // Test Case 4: Typosquatting Attempt
  console.log('Test Case 4: Typosquatting Attempt');
  const cert4 = generateTestCertificate('exampple.com'); // Double 'p'
  const result4 = await watchlist.process(cert4);
  console.log('Result:', JSON.stringify(result4, null, 2));
  console.log('\n--------------------------\n');
  
  // Test Case 5: Homograph Attack
  console.log('Test Case 5: Homograph Attack');
  const cert5 = generateTestCertificate('testvv0rld.org'); // 'vv' instead of 'w' and '0' instead of 'o'
  const result5 = await watchlist.process(cert5);
  console.log('Result:', JSON.stringify(result5, null, 2));
  console.log('\n--------------------------\n');
  
  // Test Case 6: Adjacent Key Typo
  console.log('Test Case 6: Adjacent Key Typo');
  const cert6 = generateTestCertificate('rxample.com'); // 'r' is next to 'e' on keyboard
  const result6 = await watchlist.process(cert6);
  console.log('Result:', JSON.stringify(result6, null, 2));
  console.log('\n--------------------------\n');
  
  // Clean up
  await watchlist.destroy();
  
  console.log('Test completed.');
}

// Run the test
runTest().catch(console.error);