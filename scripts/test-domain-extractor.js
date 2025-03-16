#!/usr/bin/env node
/**
 * Domain Extractor Test Script
 * 
 * This script tests the DomainExtractor module with sample certificate data.
 * It helps validate the domain extraction functionality without requiring
 * a live connection to Certificate Transparency logs.
 * 
 * Usage:
 *   node test-domain-extractor.js
 */

const DomainExtractor = require('../modules/domain-extractor');

// Create a sample certificate
function createSampleCertificate(domains) {
  return {
    message_type: 'certificate_update',
    data: {
      cert_index: Math.floor(Math.random() * 1000000),
      seen: Math.floor(Date.now() / 1000),
      source: {
        name: 'Test Source',
        url: 'https://example.com'
      },
      leaf_cert: {
        subject: {
          CN: domains[0] || 'example.com'
        },
        extensions: {
          subjectAltName: domains.map(d => `DNS:${d}`).join(', ')
        },
        not_before: Math.floor(Date.now() / 1000) - 86400,
        not_after: Math.floor(Date.now() / 1000) + 86400 * 90,
        fingerprint: `${Math.random().toString(36).substring(2)}`,
        serial_number: `${Math.random().toString(36).substring(2)}`
      },
      all_domains: domains
    }
  };
}

// Sample certificate with normal domains
const normalCert = createSampleCertificate([
  'example.com',
  'www.example.com',
  'api.example.com',
  'admin.example.com'
]);

// Sample certificate with wildcard domains
const wildcardCert = createSampleCertificate([
  'example.org',
  '*.example.org',
  '*.api.example.org',
  'test.example.org'
]);

// Sample certificate with many domains
const manyDomainsCert = createSampleCertificate(
  Array.from({ length: 50 }, (_, i) => `sub${i}.many-domains-example.com`)
);

// Sample certificate with unusual domains
const unusualCert = createSampleCertificate([
  'example-with-dash.com',
  'subdomain.example.co.uk',
  'xn--fsqu00a.xn--3ds443g', // IDN domain
  '*.xn--3ds443g'
]);

/**
 * Test the domain extractor
 */
async function testDomainExtractor() {
  console.log('Domain Extractor Test');
  console.log('====================');
  
  // Create domain extractor
  const extractor = new DomainExtractor({
    maxDomains: 1000,
    trackWildcards: true,
    showStats: false
  });
  
  // Initialize extractor
  await extractor.initialize();
  console.log('Domain extractor initialized');
  
  // Process normal certificate
  console.log('\nProcessing normal certificate...');
  const normalResult = await extractor.process(normalCert);
  console.log(`  Domains processed: ${normalResult.domainsProcessed}`);
  console.log(`  New domains: ${normalResult.newDomains.length}`);
  console.log(`  Domains: ${normalResult.newDomains.join(', ')}`);
  
  // Process wildcard certificate
  console.log('\nProcessing wildcard certificate...');
  const wildcardResult = await extractor.process(wildcardCert);
  console.log(`  Domains processed: ${wildcardResult.domainsProcessed}`);
  console.log(`  New domains: ${wildcardResult.newDomains.length}`);
  console.log(`  Domains: ${wildcardResult.newDomains.join(', ')}`);
  console.log(`  New wildcards: ${wildcardResult.newWildcards.length}`);
  console.log(`  Wildcards: ${wildcardResult.newWildcards.join(', ')}`);
  
  // Process certificate with many domains
  console.log('\nProcessing certificate with many domains...');
  const manyDomainsResult = await extractor.process(manyDomainsCert);
  console.log(`  Domains processed: ${manyDomainsResult.domainsProcessed}`);
  console.log(`  New domains: ${manyDomainsResult.newDomains.length}`);
  
  // Process unusual domains
  console.log('\nProcessing certificate with unusual domains...');
  const unusualResult = await extractor.process(unusualCert);
  console.log(`  Domains processed: ${unusualResult.domainsProcessed}`);
  console.log(`  New domains: ${unusualResult.newDomains.length}`);
  console.log(`  Domains: ${unusualResult.newDomains.join(', ')}`);
  
  // Process duplicate certificate
  console.log('\nProcessing duplicate certificate...');
  const duplicateResult = await extractor.process(normalCert);
  console.log(`  Domains processed: ${duplicateResult.domainsProcessed}`);
  console.log(`  New domains: ${duplicateResult.newDomains.length}`);
  
  // Test domain lookup
  console.log('\nTesting domain lookup...');
  console.log(`  Has 'example.com': ${extractor.hasDomain('example.com')}`);
  console.log(`  Has 'example.net': ${extractor.hasDomain('example.net')}`);
  console.log(`  Has wildcard 'example.org': ${extractor.hasWildcardDomain('example.org')}`);
  
  // Test domain search
  console.log('\nTesting domain search...');
  const searchResults = extractor.findDomains('example', { limit: 5 });
  console.log(`  Search for 'example' found ${searchResults.length} results:`);
  searchResults.forEach(domain => console.log(`    - ${domain}`));
  
  // Show statistics
  console.log('\nExtractor statistics:');
  const stats = extractor.getStats();
  console.log(`  Certificates processed: ${stats.certificatesProcessed}`);
  console.log(`  Domains processed: ${stats.domainsProcessed}`);
  console.log(`  Unique domains found: ${stats.uniqueDomainsFound}`);
  console.log(`  Wildcard domains found: ${stats.wildcardDomainsFound}`);
  
  // Clean up
  await extractor.destroy();
  console.log('\nDomain extractor test completed');
}

// Run the test
testDomainExtractor().catch(error => {
  console.error('Error in domain extractor test:', error);
  process.exit(1);
});