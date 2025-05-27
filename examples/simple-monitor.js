/**
 * Simple CT-Stream Monitor Example
 * 
 * This example demonstrates how to use the CT-Stream library to monitor
 * Certificate Transparency logs in real-time.
 */

const CTStreamMonitor = require('../src/index');
const DomainExtractor = require('../modules/domain-extractor');

// Create a custom logger (optional)
const logger = {
  debug: (message) => console.log(`[DEBUG] ${message}`),
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.log(`[WARN] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`)
};

// Create monitor with options
const monitor = new CTStreamMonitor({
  // Use the Google CT provider
  providerType: 'google-ct',
  provider: {
    logs: [
      'https://ct.googleapis.com/logs/us1/argon2025h1/',
      'https://ct.googleapis.com/logs/us1/argon2025h2/'
    ],
    pollInterval: 5000,
    batchSize: 50
  },
  
  // Cache options (optional)
  cache: {
    enabled: true,
    certificates: {
      enabled: true,
      maxSize: 1000  // Keep last 1000 certificates in memory
    }
  },
  
  // Don't auto-start
  autoStart: false
}, logger);

// Create domain extractor module
const domainExtractor = new DomainExtractor({
  // Only track 1000 domains to avoid memory issues
  maxDomains: 1000,
  // Whether to track wildcard domains (*.example.com)
  trackWildcards: true
}, logger);

// Register the domain extractor module
monitor.registerModule('domain-extractor', domainExtractor);

// Set up event handlers
monitor.on('certificate', (data) => {
  // Extract data
  const { certificate, timestamp, moduleResults } = data;
  
  // Check if we have certificate data
  if (!certificate) {
    return;
  }
  
  // Create message
  const domains = certificate.domains || [];
  const message = {
    timestamp,
    certificate: {
      commonName: certificate.commonName,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      domainCount: domains.length
    },
    // Include first 5 domains for display
    domains: domains.slice(0, 5)
  };
  
  // Add ellipsis if we truncated domains
  if (domains.length > 5) {
    message.domains.push(`... and ${domains.length - 5} more`);
  }
  
  // Print certificate information
  console.log(JSON.stringify(message, null, 2));
});

monitor.on('error', (error) => {
  logger.error(`Monitor error: ${error.message}`);
});

monitor.on('connected', () => {
  logger.info('Connected to CT log stream');
});

monitor.on('disconnected', () => {
  logger.info('Disconnected from CT log stream');
});

// Start the monitor
(async () => {
  try {
    logger.info('Initializing monitor...');
    await monitor.initialize();
    
    logger.info('Starting monitor...');
    await monitor.start();
    
    // Set up interval to print stats every 30 seconds
    const statsInterval = setInterval(() => {
      const stats = monitor.getStats();
      
      logger.info(`Certificates processed: ${stats.monitor.certificates.processed}`);
      logger.info(`Certificates per second: ${stats.monitor.certificates.perSecond}`);
      logger.info(`Unique domains: ${stats.modules['domain-extractor']?.domains?.unique || 0}`);
      
      // Print top 10 domains if we have any
      if (domainExtractor.domains.size > 0) {
        logger.info('Recent domains:');
        const domains = Array.from(domainExtractor.domains.keys()).slice(0, 10);
        domains.forEach(domain => logger.info(`  - ${domain}`));
      }
    }, 30000);
    
    // Handle graceful shutdown
    const shutdown = async () => {
      clearInterval(statsInterval);
      
      logger.info('Shutting down monitor...');
      await monitor.shutdown();
      
      process.exit(0);
    };
    
    // Listen for shutdown signals
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    logger.info('Monitor running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error(`Failed to start monitor: ${error.message}`);
    process.exit(1);
  }
})();