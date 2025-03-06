#!/usr/bin/env node
/**
 * Standalone Domain Extractor
 * 
 * This script connects to Certificate Transparency logs and extracts domain names
 * from certificates in real-time, saving them to a file.
 * 
 * Usage:
 *   node standalone-domain-extractor.js [options]
 * 
 * Options:
 *   --output=file.json    Output file for domains (default: domains.json)
 *   --format=json|text    Output format (default: json)
 *   --filter=pattern      Only include domains matching this pattern
 *   --max-domains=N       Maximum number of domains to collect (default: 100000)
 *   --save-interval=N     Save interval in seconds (default: 60)
 *   --track-wildcards     Track wildcard domains (*.example.com)
 */

const CTStreamMonitor = require('../src/index');
const DomainExtractor = require('../modules/domain-extractor');
const { CacheUtils } = require('../src/lib/cache');
const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
const args = processArguments();

// Configure logging
const logger = {
  debug: (message) => args.verbose && console.log(`[DEBUG] ${message}`),
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`)
};

// Print banner
console.log('CT-Stream Standalone Domain Extractor');
console.log('=====================================');
console.log(`Output: ${args.output} (${args.format})`);
console.log(`Max domains: ${args.maxDomains}`);
console.log(`Save interval: ${args.saveInterval} seconds`);
if (args.filter) console.log(`Filter: ${args.filter}`);
console.log(`Track wildcards: ${args.trackWildcards ? 'Yes' : 'No'}`);
console.log(`Verbose logging: ${args.verbose ? 'Yes' : 'No'}`);
console.log('');

// Create domain extractor module
const domainExtractor = new DomainExtractor({
  maxDomains: args.maxDomains,
  trackWildcards: args.trackWildcards,
  normalizeNames: true
}, logger);

// Create monitor with options
const monitor = new CTStreamMonitor({
  provider: {
    url: 'wss://certstream.calidog.io/',
    skipHeartbeats: true,
    maxReconnectAttempts: 20
  },
  cache: {
    enabled: false // Disable cache for standalone extractor to save memory
  },
  autoStart: false
}, logger);

// Register the domain extractor module
monitor.registerModule('domain-extractor', domainExtractor);

// Track statistics
let lastSaveTime = Date.now();
let lastStatTime = Date.now();
let lastDomainsCount = 0;
let certificatesProcessed = 0;

// Set up event handlers
monitor.on('certificate', (data) => {
  certificatesProcessed++;
  
  // Print stats every 10 seconds
  const now = Date.now();
  if (now - lastStatTime >= 10000) {
    const elapsedSec = (now - lastStatTime) / 1000;
    const currentDomainsCount = domainExtractor.domains.size;
    const newDomains = currentDomainsCount - lastDomainsCount;
    const domainsPerSecond = (newDomains / elapsedSec).toFixed(2);
    
    logger.info(`Processed ${certificatesProcessed} certificates, found ${currentDomainsCount} unique domains (${domainsPerSecond}/sec)`);
    
    // Reset stats
    lastStatTime = now;
    lastDomainsCount = currentDomainsCount;
    certificatesProcessed = 0;
  }
  
  // Save domains at regular intervals
  if (now - lastSaveTime >= args.saveInterval * 1000) {
    saveDomains();
    lastSaveTime = now;
  }
});

monitor.on('error', (error) => {
  logger.error(`Monitor error: ${error.message}`);
});

// Start the monitor
(async () => {
  try {
    logger.info('Initializing domain extractor...');
    await monitor.initialize();
    
    logger.info('Starting CT log monitoring...');
    await monitor.start();
    
    logger.info('Extractor running. Press Ctrl+C to stop.');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Stopping domain extractor...');
      
      // Save final domains
      await saveDomains('final');
      
      // Shut down monitor
      await monitor.shutdown();
      
      // Exit cleanly
      process.exit(0);
    });
  } catch (error) {
    logger.error(`Failed to start domain extractor: ${error.message}`);
    process.exit(1);
  }
})();

/**
 * Save domains to file
 * @param {string} [suffix] - Optional suffix for filename
 */
async function saveDomains(suffix = '') {
  try {
    // Determine output filename
    let outputPath = args.output;
    
    // Add suffix if provided
    if (suffix) {
      const ext = path.extname(outputPath);
      const base = path.basename(outputPath, ext);
      const dir = path.dirname(outputPath);
      outputPath = path.join(dir, `${base}-${suffix}${ext}`);
    }
    
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Apply filter if specified
    let domains = Array.from(domainExtractor.domains.keys());
    let wildcardDomains = Array.from(domainExtractor.wildcardDomains.keys());
    
    if (args.filter) {
      try {
        const regex = new RegExp(args.filter, 'i');
        domains = domains.filter(domain => regex.test(domain));
        wildcardDomains = wildcardDomains.filter(domain => regex.test(domain));
      } catch (error) {
        logger.error(`Invalid filter pattern: ${error.message}`);
      }
    }
    
    // Save based on format
    if (args.format === 'json') {
      // JSON format
      const data = {
        metadata: {
          timestamp: new Date().toISOString(),
          filter: args.filter || null,
          domainCount: domains.length,
          wildcardDomainCount: args.trackWildcards ? wildcardDomains.length : 0,
          totalDomainCount: domains.length + (args.trackWildcards ? wildcardDomains.length : 0)
        },
        domains,
        ...(args.trackWildcards ? { wildcardDomains } : {})
      };
      
      await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    } else {
      // Text format (one domain per line)
      const allDomains = domains.concat(args.trackWildcards ? wildcardDomains : []);
      allDomains.sort();
      await fs.writeFile(outputPath, allDomains.join('\n'));
    }
    
    logger.info(`Saved ${domains.length} domains${args.trackWildcards ? ` and ${wildcardDomains.length} wildcard domains` : ''} to ${outputPath}`);
  } catch (error) {
    logger.error(`Error saving domains: ${error.message}`);
  }
}

/**
 * Process command line arguments
 * @returns {Object} Parsed arguments
 */
function processArguments() {
  const processArgs = process.argv.slice(2);
  const args = {
    output: 'domains.json',
    format: 'json',
    filter: null,
    maxDomains: 100000,
    saveInterval: 60,
    trackWildcards: false,
    verbose: false
  };
  
  for (const arg of processArgs) {
    if (arg.startsWith('--output=')) {
      args.output = arg.substring('--output='.length);
    } else if (arg.startsWith('--format=')) {
      const format = arg.substring('--format='.length).toLowerCase();
      if (format === 'json' || format === 'text') {
        args.format = format;
      } else {
        console.warn(`Unknown format: ${format}, using 'json'`);
      }
    } else if (arg.startsWith('--filter=')) {
      args.filter = arg.substring('--filter='.length);
    } else if (arg.startsWith('--max-domains=')) {
      const maxDomains = parseInt(arg.substring('--max-domains='.length));
      if (!isNaN(maxDomains) && maxDomains > 0) {
        args.maxDomains = maxDomains;
      }
    } else if (arg.startsWith('--save-interval=')) {
      const interval = parseInt(arg.substring('--save-interval='.length));
      if (!isNaN(interval) && interval > 0) {
        args.saveInterval = interval;
      }
    } else if (arg === '--track-wildcards') {
      args.trackWildcards = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.warn(`Unknown argument: ${arg}`);
    }
  }
  
  return args;
}

/**
 * Print help information
 */
function printHelp() {
  console.log('CT-Stream Standalone Domain Extractor');
  console.log('');
  console.log('Usage:');
  console.log('  node standalone-domain-extractor.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --output=file.json    Output file for domains (default: domains.json)');
  console.log('  --format=json|text    Output format (default: json)');
  console.log('  --filter=pattern      Only include domains matching this pattern');
  console.log('  --max-domains=N       Maximum number of domains to collect (default: 100000)');
  console.log('  --save-interval=N     Save interval in seconds (default: 60)');
  console.log('  --track-wildcards     Track wildcard domains (*.example.com)');
  console.log('  --verbose             Enable verbose logging');
  console.log('  --help                Show this help message');
}