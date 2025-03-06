/**
 * New Cache Key Format Tester
 * 
 * This script tests the updated cache key generation logic with the new certificate format.
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
  defaultTTL: 3600, // 1 hour TTL
  cleanupInterval: 60000 // 1 minute cleanup interval
};

// Create unified cache and legacy cache
const cache = new CacheManager(cacheConfig, logger);
const { CacheUtils } = CacheManager;

// Sample certificate in the new format (based on the provided example)
const sampleCertificate = {
  timestamp: "2025-03-05T02:14:10.592Z",
  certificate: {
    subject: {
      common_name: "*.iam.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com",
      organization: "Unknown"
    },
    issuer: {
      common_name: "Amazon RSA 2048 M03"
    },
    validity: {
      not_before: 1741132800,
      not_after: 1775347199
    },
    serial_number: "FE1CC540D8C7A421D5E90FC9B1EAF3E",
    fingerprint: {
      sha256: "62:DA:D9:37:00:68:5C:EF:89:40:7A:F2:57:B5:C2:6F:35:CA:70:6B"
    }
  },
  ct_logs: [
    {
      log_name: "Google 'Xenon2026h1' log",
      log_id: "https://ct.googleapis.com/logs/eu1/xenon2026h1/"
    }
  ],
  domains: [
    "*.iam.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com",
    "*.iam2.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com",
    "*.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com",
    "*.scram.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com",
    "*.scram2.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com",
    "*.tls.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com",
    "*.tls2.prometheuslongrunningc.sh7ohj.c1.kafka.ca-west-1.amazonaws.com"
  ]
};

// Legacy format certificate (for comparison)
const legacyCertificate = {
  message_type: 'certificate_update',
  data: {
    update_type: 'X509LogEntry',
    leaf_cert: {
      subject: {
        CN: "*.example.com"
      },
      issuer: {
        CN: "Example CA"
      },
      not_before: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      not_after: new Date(Date.now() + 86400000 * 90).toISOString(), // 90 days from now
      fingerprint: `fp_example_${Date.now()}`,
      extensions: {
        subjectAltName: "DNS:*.example.com, DNS:example.com, DNS:api.example.com"
      }
    }
  }
};

// Test the cache key generation
async function runTest() {
  console.log('\n=== Testing New Cache Key Format ===\n');
  
  // Test 1: Generate key for the new certificate format
  try {
    const cacheKey = CacheUtils.generateCacheKey(sampleCertificate);
    console.log('Cache - New Format Key:');
    console.log(cacheKey);
    
    // Extract parts for verification
    const [prefix, ...parts] = cacheKey.split(':');
    console.log('\nKey components:');
    console.log(`- Prefix: ${prefix}`);
    console.log(`- Remaining parts: ${parts.join(':')}`);
    
    // Show the sorted domains used in key generation
    console.log('\nSorted domains used in key:');
    const sortedDomains = [...sampleCertificate.domains].sort();
    console.log(sortedDomains.join(', '));
  } catch (error) {
    console.error('Error generating unified key for new format:', error);
  }
  
  // Test 2: Generate key using the legacy cache
  try {
    const legacyNewFormatKey = CacheUtils.generateCacheKey(sampleCertificate);
    console.log('\nLegacy Cache - New Format Key:');
    console.log(legacyNewFormatKey);
  } catch (error) {
    console.error('Error generating legacy key for new format:', error);
  }
  
  // Test 3: Generate key for legacy certificate format
  try {
    const unifiedLegacyKey = CacheUtils.generateCacheKey(legacyCertificate);
    console.log('\nUnified Cache - Legacy Format Key:');
    console.log(unifiedLegacyKey);
  } catch (error) {
    console.error('Error generating unified key for legacy format:', error);
  }
  
  // Test 4: Generate key using the legacy cache for legacy format
  try {
    const legacyLegacyFormatKey = CacheUtils.generateCacheKey(legacyCertificate);
    console.log('\nLegacy Cache - Legacy Format Key:');
    console.log(legacyLegacyFormatKey);
  } catch (error) {
    console.error('Error generating legacy key for legacy format:', error);
  }
  
  // Clean up
  // Note: destroy method has been replaced with shutdown in new API
  await cache.shutdown();
  console.log('\nTest completed.');
}

// Run the test
runTest().catch(console.error);