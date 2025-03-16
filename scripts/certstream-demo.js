#!/usr/bin/env node
/**
 * CertStream Demo Script
 * 
 * This script demonstrates how to use the CT-Stream library to monitor
 * Certificate Transparency logs in real-time and process them using the
 * consolidated cache system.
 */

const CTStreamMonitor = require('../src/index');

// Configuration
const RUNTIME_SECONDS = process.argv[2] ? parseInt(process.argv[2]) : 60;
const MAX_CERTS_TO_SHOW = 5;

// Create a simple logger that formats output
const logger = {
  debug: (message) => console.error(`\x1b[34m[DEBUG]\x1b[0m ${message}`),
  info: (message) => console.error(`\x1b[32m[INFO]\x1b[0m ${message}`),
  warn: (message) => console.error(`\x1b[33m[WARN]\x1b[0m ${message}`),
  error: (message) => console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`)
};

// Print welcome message
logger.info("CT-Stream Certificate Transparency Monitor Demo");
logger.info(`Will run for ${RUNTIME_SECONDS} seconds`);
logger.info("----------------------------------------------");

// Create monitor with options
const monitor = new CTStreamMonitor({
  // Provider options
  provider: {
    url: 'wss://certstream.calidog.io/',
    skipHeartbeats: true
  },
  
  // Cache options
  cache: {
    enabled: true,
    certificates: {
      enabled: true,
      maxSize: 5000,  // Keep last 5000 certificates in memory
      ttl: 3600       // 1 hour TTL
    },
    domains: {
      enabled: true,
      maxSize: 10000, // Keep last 10000 domains in memory
      ttl: 86400      // 24 hour TTL
    }
  },
  
  // Don't auto-start
  autoStart: false
}, logger);

// Certificate counter and storage
let certCount = 0;
const uniqueDomains = new Set();
const recentCerts = [];

// Set up event handlers
monitor.on('certificate', (data) => {
  // Update counter
  certCount++;
  
  // Get certificate data
  const { certificate, timestamp } = data;
  
  if (!certificate) return;
  
  // Track domains
  if (certificate.domains && Array.isArray(certificate.domains)) {
    certificate.domains.forEach(domain => {
      if (domain) uniqueDomains.add(domain.toLowerCase());
    });
  }
  
  // Store recent certificates (limited quantity)
  if (recentCerts.length >= MAX_CERTS_TO_SHOW) {
    recentCerts.shift(); // Remove oldest
  }
  
  // Add certificate to recent list with simplified data
  recentCerts.push({
    timestamp,
    commonName: certificate.commonName,
    issuer: certificate.issuer,
    domains: certificate.domains ? certificate.domains.slice(0, 3) : [],
    domainCount: certificate.domains ? certificate.domains.length : 0
  });
  
  // Log progress periodically
  if (certCount % 100 === 0) {
    logger.debug(`Processed ${certCount} certificates, ${uniqueDomains.size} unique domains`);
  }
  
  // Print detailed cert data for every 50th certificate
  if (certCount % 50 === 0) {
    const cert = recentCerts[recentCerts.length - 1];
    logger.info("----- New Certificate -----");
    logger.info(`Common Name: ${cert.commonName}`);
    logger.info(`Issuer: ${cert.issuer}`);
    logger.info(`Domains: ${cert.domainCount} total`);
    if (cert.domains.length > 0) {
      cert.domains.forEach((domain, i) => {
        logger.info(`  - ${domain}`);
      });
      if (cert.domainCount > cert.domains.length) {
        logger.info(`  - ... and ${cert.domainCount - cert.domains.length} more`);
      }
    }
    logger.info("-------------------------");
  }
});

monitor.on('error', (error) => {
  logger.error(`Error: ${error.message}`);
});

monitor.on('connected', () => {
  logger.info("Connected to Certificate Transparency stream");
});

monitor.on('disconnected', () => {
  logger.info("Disconnected from Certificate Transparency stream");
});

// Print JSON output of certificates on separate channel
function printCertificateJSON() {
  if (recentCerts.length === 0) return;
  
  const cert = recentCerts[recentCerts.length - 1];
  
  // Create a clean JSON output for stdout
  const output = {
    timestamp: cert.timestamp,
    commonName: cert.commonName,
    issuer: cert.issuer,
    domainCount: cert.domainCount,
    domains: cert.domains
  };
  
  // Output clean JSON to stdout (separate from logs which go to stderr)
  console.log(JSON.stringify(output));
}

// Start the monitor
(async () => {
  try {
    logger.info("Initializing monitor...");
    await monitor.initialize();
    
    logger.info("Starting monitor...");
    await monitor.start();
    
    // Set up interval to display a certificate as JSON every second
    const outputInterval = setInterval(printCertificateJSON, 1000);
    
    // Set up interval to print stats every 10 seconds
    const statsInterval = setInterval(() => {
      const stats = monitor.getStats();
      
      logger.info("=== Monitor Statistics ===");
      logger.info(`Runtime: ${stats.monitor.runtime.formatted}`);
      logger.info(`Certificates: ${stats.monitor.certificates.processed}`);
      logger.info(`Certificates/sec: ${stats.monitor.certificates.perSecond}`);
      
      if (stats.cache && stats.cache.caches) {
        const certCache = stats.cache.caches.certificates;
        const domainCache = stats.cache.caches.domains;
        
        if (certCache) {
          logger.info(`Certificate cache: ${certCache.size}/${certCache.maxSize} items (${certCache.usagePercent}% used)`);
          logger.info(`Certificate cache hit ratio: ${certCache.hitRatio}`);
        }
        
        if (domainCache) {
          logger.info(`Domain cache: ${domainCache.size}/${domainCache.maxSize} items (${domainCache.usagePercent}% used)`);
          logger.info(`Domain cache hit ratio: ${domainCache.hitRatio}`);
        }
      }
      
      logger.info(`Unique domains tracked: ${uniqueDomains.size}`);
      logger.info("=========================");
      
    }, 10000);
    
    // Set up timeout to stop
    setTimeout(async () => {
      clearInterval(statsInterval);
      clearInterval(outputInterval);
      
      logger.info("Demo complete. Shutting down...");
      logger.info(`Processed ${certCount} certificates`);
      logger.info(`Tracked ${uniqueDomains.size} unique domains`);
      
      // Print final cache statistics
      const stats = monitor.getStats();
      if (stats.cache) {
        logger.info("Final cache statistics:");
        logger.info(JSON.stringify(stats.cache, null, 2));
      }
      
      await monitor.shutdown();
      process.exit(0);
    }, RUNTIME_SECONDS * 1000);
    
  } catch (error) {
    logger.error(`Failed to start monitor: ${error.message}`);
    process.exit(1);
  }
})();