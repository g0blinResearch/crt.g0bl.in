/**
 * Unified Cache Test Script
 * 
 * This script tests the unified cache manager with certificate deduplication.
 * It doesn't require an actual connection to CT logs.
 */

// Import required modules
const CacheManager = require('../src/lib/cache');

// Mock logger
const logger = {
  info: console.log,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
  success: console.log
};

// Cache configuration
const cacheConfig = {
  defaultTTL: 5, // 5 seconds TTL for quick testing
  cleanupInterval: 2000 // 2 seconds cleanup interval
};

// Create cache
const cache = new CacheManager(cacheConfig, logger);

// Generate a test certificate
function generateTestCertificate(domain, issuerId) {
  return {
    message_type: 'certificate_update',
    data: {
      update_type: 'X509LogEntry',
      leaf_cert: {
        subject: {
          CN: domain
        },
        issuer: {
          CN: `Test CA ${issuerId}`
        },
        not_before: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        not_after: new Date(Date.now() + 86400000 * 90).toISOString(), // 90 days from now
        fingerprint: `fp_${domain}_${issuerId}_${Date.now()}`,
        extensions: {
          subjectAltName: `DNS:${domain}, DNS:www.${domain}`
        }
      }
    }
  };
}

// Test with duplicates and unique certificates
async function runTest() {
  console.log('=== Unified Cache Test ===');
  
  // Stats
  let processed = 0;
  let unique = 0;
  let duplicates = 0;

  // Test 1: Add a certificate
  const cert1 = generateTestCertificate('example.com', 1);
  processed++;
  if (!cache.certificateExists(cert1)) {
    await cache.addCertificate(cert1);
    unique++;
    console.log(`Certificate added: ${cert1.data.leaf_cert.fingerprint}`);
  } else {
    duplicates++;
    console.log(`Duplicate found: ${cert1.data.leaf_cert.fingerprint}`);
  }
  
  // Test 2: Add the same certificate again (should be duplicate)
  processed++;
  if (!cache.certificateExists(cert1)) {
    await cache.addCertificate(cert1);
    unique++;
    console.log(`Certificate added: ${cert1.data.leaf_cert.fingerprint}`);
  } else {
    duplicates++;
    console.log(`Duplicate found: ${cert1.data.leaf_cert.fingerprint}`);
  }
  
  // Test 3: Add a different certificate
  const cert2 = generateTestCertificate('test.com', 2);
  processed++;
  if (!cache.certificateExists(cert2)) {
    await cache.addCertificate(cert2);
    unique++;
    console.log(`Certificate added: ${cert2.data.leaf_cert.fingerprint}`);
  } else {
    duplicates++;
    console.log(`Duplicate found: ${cert2.data.leaf_cert.fingerprint}`);
  }
  
  // Test 4: Add a certificate with the same domain but different fingerprint
  const cert3 = generateTestCertificate('example.com', 3);
  processed++;
  if (!cache.certificateExists(cert3)) {
    await cache.addCertificate(cert3);
    unique++;
    console.log(`Certificate added: ${cert3.data.leaf_cert.fingerprint}`);
  } else {
    duplicates++;
    console.log(`Duplicate found: ${cert3.data.leaf_cert.fingerprint}`);
  }
  
  // Test 5: Test module result caching
  const moduleKey = "test:module:result";
  const moduleData = { result: "test result", timestamp: Date.now() };
  
  await cache.set(moduleKey, moduleData, 10);
  console.log(`Module data cached with key: ${moduleKey}`);
  
  const cachedData = await cache.get(moduleKey);
  console.log(`Retrieved cached module data: ${JSON.stringify(cachedData)}`);
  
  // Print stats
  console.log(`\nStats: ${unique}/${processed} unique (${duplicates} duplicates filtered)`);
  console.log('Cache size:', cache.getStats().size);
  console.log('Certificate entries:', cache.getStats().certificates);
  
  // Test 6: Wait for TTL expiration and try again
  console.log('\nWaiting for cache TTL expiration...');
  await new Promise(resolve => setTimeout(resolve, cacheConfig.defaultTTL * 1000 + 1000));
  
  // Try the first certificate again after TTL expiration
  processed++;
  if (!cache.certificateExists(cert1)) {
    await cache.addCertificate(cert1);
    unique++;
    console.log(`Certificate added after TTL: ${cert1.data.leaf_cert.fingerprint}`);
  } else {
    duplicates++;
    console.log(`Still in cache (unexpected): ${cert1.data.leaf_cert.fingerprint}`);
  }
  
  // Wait for cleanup
  console.log('\nWaiting for cleanup...');
  await new Promise(resolve => setTimeout(resolve, cacheConfig.cleanupInterval + 1000));
  
  // Print final stats
  console.log(`\nFinal stats: ${unique}/${processed} unique (${duplicates} duplicates filtered)`);
  console.log('Final cache size:', cache.getStats().size);
  console.log('Final certificate entries:', cache.getStats().certificates);
  
  // Clean up
  cache.shutdown();
  console.log('\nTest completed.');
}

// Run the test
runTest().catch(console.error);