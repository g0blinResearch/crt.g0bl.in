#!/usr/bin/env node
/**
 * Certificate Transparency Stream Subscriber
 * Real-time monitoring of SSL/TLS certificates
 */

// External dependencies
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');

// Initialize command-line interface
const program = new Command();

// Define CLI options
program
  .version('1.0.0')
  .description('Certificate Transparency Stream Subscriber - Real-time monitoring of SSL/TLS certificates')
  .option('-l, --log-level <level>', 'Set logging level (debug, info, warn, error)', 'info')
  .option('-u, --url <url>', 'CertStream WebSocket URL', 'wss://certstream.calidog.io/')
  .option('-p, --providers <list>', 'Comma-separated list of enabled providers', 'certstream')
  .option('-i, --polling-interval <ms>', 'Polling interval in milliseconds for HTTP providers', '60000')
  .option('-m, --max-entries <number>', 'Maximum entries to fetch per request', '100')
  .option('-t, --output-type <type>', 'Output type (json, text)', 'json')
  .option('-f, --output-format <format>', 'Output format (pretty, raw)', 'pretty')
  .option('-o, --output-file <path>', 'Output file path (empty for terminal only)', '')
  .option('-q, --quiet', 'Output only certificate data, no logs or status messages', false);

// Parse command-line arguments
program.parse(process.argv);

// Get command-line options
const cliOptions = program.opts();

// Create configuration
const { createConfig } = require('./lib/config');
const config = createConfig(cliOptions);

// Set up logger
const { createLogger } = require('./lib/logger');
const logger = createLogger(config);

// Log startup information
logger.info('Certificate Transparency Stream Subscriber starting...');
logger.debug(`Configuration: ${JSON.stringify(config, null, 2)}`);
logger.debug(`Log level set to: ${logger.getCurrentLevel()}`);

// Import formatters
let formatters;
try {
  formatters = {
    json: require('./formatters/json-formatter'),
    text: require('./formatters/text-formatter')
  };
} catch (error) {
  logger.error(`Error loading formatters: ${error.message}`);
  process.exit(1);
}

// Get formatter based on config
const formatter = formatters[config.outputType] || formatters.json;

// Import provider factory
const { createProvider } = require('./providers/provider-factory');

/**
 * Write data to output file
 * @param {string} filePath - Path to the output file
 * @param {string} data - Data to write
 * @param {boolean} append - Whether to append to the file (true) or overwrite (false)
 * @returns {Promise<void>}
 */
const writeToFile = async (filePath, data, append = true) => {
  try {
    // Ensure the directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Created directory: ${dir}`);
    }

    // Write to file
    if (append) {
      // Append to file with a newline
      await fs.promises.appendFile(filePath, data + '\n');
      logger.debug(`Appended certificate data to ${filePath}`);
    } else {
      // Overwrite file
      await fs.promises.writeFile(filePath, data);
      logger.debug(`Wrote certificate data to ${filePath}`);
    }
  } catch (error) {
    logger.error(`Error writing to file ${filePath}: ${error.message}`);
  }
};

// Create and start providers
const runProviders = async () => {
  for (const providerName of config.enabledProviders) {
    try {
      logger.info(`Starting provider: ${providerName}`);
      
      // Create provider instance with both config and logger
      const provider = createProvider(providerName, config, logger);
      
      if (!provider) {
        logger.error(`Unknown provider: ${providerName}`);
        continue;
      }
      
      // Setup event handlers
      provider.on('certificate', (data) => {
        try {
          // For console output - use the configured format with colors if text mode
          const isPretty = config.outputFormat === 'pretty';
          const formattedData = formatter.formatCertificate(data, isPretty);
          
          // Output to console - logger.certificate will handle quiet mode internally
          logger.certificate(formattedData);
          
          // Write to output file if configured
          if (config.outputFile) {
            let fileOutputData;
            
            if (config.outputType === 'json') {
              // For JSON: If pretty mode for console, use compact JSON for file
              fileOutputData = isPretty ? JSON.stringify(data) : formattedData;
            } else {
              // For text: Always use non-colorized version for file
              fileOutputData = formatters.text.formatCertificate(data, false);
            }
              
            writeToFile(config.outputFile, fileOutputData);
          }
        } catch (error) {
          logger.error(`Error processing certificate update: ${error.message}`);
        }
      });
      
      provider.on('error', (error) => {
        logger.error(`Provider error (${providerName}):`, error.message || error);
      });
      
      // Start the provider
      await provider.start();
      logger.success(`Provider ${providerName} started successfully`);
      
    } catch (error) {
      logger.error(`Failed to start provider ${providerName}:`, error.message || error);
      process.exit(1);
    }
  }
};

// Handle process termination
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  // Close all providers
  process.exit(0);
});

// Start the application
runProviders().catch(error => {
  logger.error('Failed to start providers:', error.message || error);
  process.exit(1);
});