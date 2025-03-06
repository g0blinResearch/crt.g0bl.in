#!/usr/bin/env node
/**
 * CT-Stream JSON Stream
 * 
 * A simple tool that streams Certificate Transparency logs in real-time
 * and outputs them as clean JSON objects, one per line.
 * 
 * This is designed for piping to other tools or for direct analysis.
 * Logs and errors go to stderr, while certificate data goes to stdout.
 */

const CTStreamMonitor = require('../src/index');

// Process command line arguments
const args = process.argv.slice(2);
const options = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  pretty: args.includes('--pretty') || args.includes('-p'),
  full: args.includes('--full') || args.includes('-f'),
  help: args.includes('--help') || args.includes('-h'),
  filterIssuer: null,
  filterDomain: null
};

// Process filter arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--issuer' && i + 1 < args.length) {
    options.filterIssuer = args[i + 1].toLowerCase();
  } else if (args[i] === '--domain' && i + 1 < args.length) {
    options.filterDomain = args[i + 1].toLowerCase();
  }
}

// Help text
if (options.help) {
  console.error(`
CT-Stream JSON Stream
---------------------

A real-time stream of Certificate Transparency logs in JSON format.

Usage: node json-stream.js [options]

Options:
  -h, --help           Show this help message
  -v, --verbose        Enable verbose output to stderr
  -p, --pretty         Output pretty-printed JSON (default is compact)
  -f, --full           Include full certificate details
  --issuer <pattern>   Only show certificates from issuers matching pattern
  --domain <pattern>   Only show certificates containing domains matching pattern

Examples:
  # Basic usage - outputs compact JSON for each certificate
  node json-stream.js

  # Pretty-printed JSON with verbose logging
  node json-stream.js --pretty --verbose

  # Filter for Let's Encrypt certificates
  node json-stream.js --issuer "let's encrypt"

  # Filter for certificates containing google.com domains
  node json-stream.js --domain "google.com"

  # Pipe output to jq for further processing
  node json-stream.js | jq 'select(.domains | length > 10)'

Notes:
  - Logs and errors go to stderr, while certificate data goes to stdout
  - One JSON object per line (unless --pretty is specified)
  - Press Ctrl+C to stop
`);
  process.exit(0);
}

// Create a simple logger for errors and info
const logger = {
  debug: (message) => {
    if (options.verbose) console.error(`[DEBUG] ${message}`);
  },
  info: (message) => {
    if (options.verbose) console.error(`[INFO] ${message}`);
  },
  warn: (message) => console.error(`[WARN] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`)
};

// Print startup message
logger.info("CT-Stream JSON Stream Starting");
logger.info("------------------------------");
logger.info(`Verbose mode: ${options.verbose}`);
logger.info(`Pretty output: ${options.pretty}`);
logger.info(`Full certificate details: ${options.full}`);
if (options.filterIssuer) logger.info(`Filtering by issuer: ${options.filterIssuer}`);
if (options.filterDomain) logger.info(`Filtering by domain: ${options.filterDomain}`);
logger.info("Certificate data will be sent to stdout...");

// Create monitor with minimal cache (to save memory)
const monitor = new CTStreamMonitor({
  provider: {
    url: 'wss://certstream.calidog.io/',
    skipHeartbeats: true
  },
  cache: {
    enabled: false // Disable cache for this use case
  },
  autoStart: false
}, logger);

// Set up statistics tracking
let statsData = {
  startTime: null,
  certificatesProcessed: 0,
  certificatesOutput: 0,
  lastOutputTime: null
};

// Set up event handlers
monitor.on('certificate', (data) => {
  try {
    // Update stats
    statsData.certificatesProcessed++;
    
    // Skip if no certificate data
    if (!data || !data.certificate) return;
    
    const { certificate, timestamp } = data;
    
    // Apply filters
    let shouldOutput = true;
    
    // Filter by issuer if specified
    if (options.filterIssuer && certificate.issuer) {
      if (!certificate.issuer.toLowerCase().includes(options.filterIssuer)) {
        shouldOutput = false;
      }
    }
    
    // Filter by domain if specified
    if (shouldOutput && options.filterDomain && certificate.domains) {
      const matchingDomain = certificate.domains.some(domain => 
        domain.toLowerCase().includes(options.filterDomain)
      );
      if (!matchingDomain) {
        shouldOutput = false;
      }
    }
    
    // Skip if filtered out
    if (!shouldOutput) return;
    
    // Update stats
    statsData.certificatesOutput++;
    statsData.lastOutputTime = Date.now();
    
    // Prepare output
    let outputData;
    
    if (options.full) {
      // Full certificate details
      outputData = {
        timestamp,
        ...certificate
      };
    } else {
      // Simplified certificate details
      outputData = {
        timestamp,
        commonName: certificate.commonName,
        issuer: certificate.issuer,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        domains: certificate.domains,
        domainCount: certificate.domains ? certificate.domains.length : 0,
        serialNumber: certificate.serialNumber,
        fingerprint: certificate.fingerprint
      };
    }
    
    // Output as JSON
    if (options.pretty) {
      console.log(JSON.stringify(outputData, null, 2));
    } else {
      console.log(JSON.stringify(outputData));
    }
    
  } catch (error) {
    logger.error(`Error processing certificate: ${error.message}`);
  }
});

monitor.on('error', (error) => {
  logger.error(`Monitor error: ${error.message}`);
});

monitor.on('connected', () => {
  logger.info('Connected to Certificate Transparency stream');
});

monitor.on('disconnected', () => {
  logger.info('Disconnected from Certificate Transparency stream');
});

// Start the monitor
(async () => {
  try {
    logger.info('Initializing...');
    await monitor.initialize();
    
    logger.info('Starting stream...');
    await monitor.start();
    
    // Set statistics tracking
    statsData.startTime = Date.now();
    
    // Print statistics every 60 seconds if verbose
    if (options.verbose) {
      setInterval(() => {
        const runtime = Math.floor((Date.now() - statsData.startTime) / 1000);
        const certPerSecond = runtime > 0 ? (statsData.certificatesProcessed / runtime).toFixed(2) : 0;
        const outputPerSecond = runtime > 0 ? (statsData.certificatesOutput / runtime).toFixed(2) : 0;
        
        logger.info(`Stats: ${statsData.certificatesProcessed} certificates processed (${certPerSecond}/sec)`);
        logger.info(`Stats: ${statsData.certificatesOutput} certificates output (${outputPerSecond}/sec)`);
        
        const filter = [];
        if (options.filterIssuer) filter.push(`issuer=${options.filterIssuer}`);
        if (options.filterDomain) filter.push(`domain=${options.filterDomain}`);
        
        if (filter.length > 0) {
          logger.info(`Stats: Filtering by ${filter.join(', ')}`);
        }
      }, 60000);
    }
    
    logger.info('Stream running. Press Ctrl+C to stop.');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\nShutting down...');
      
      // Print final statistics
      const runtime = Math.floor((Date.now() - statsData.startTime) / 1000);
      const minutes = Math.floor(runtime / 60);
      const seconds = runtime % 60;
      const runtimeFormatted = `${minutes}m ${seconds}s`;
      
      logger.info(`Total certificates processed: ${statsData.certificatesProcessed}`);
      logger.info(`Total certificates output: ${statsData.certificatesOutput}`);
      logger.info(`Total runtime: ${runtimeFormatted}`);
      
      await monitor.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error(`Failed to start: ${error.message}`);
    process.exit(1);
  }
})();