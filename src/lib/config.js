/**
 * Configuration module for Certificate Transparency Stream Subscriber
 */
const dotenv = require('dotenv');
const path = require('path');

// Load configuration from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Create and return the configuration object
 * @param {Object} cliOptions - Command line options to override defaults
 * @returns {Object} The configuration object
 */
function createConfig(cliOptions = {}) {
  // Default WebSocket URL
  const defaultCertStreamUrl = 'wss://certstream.calidog.io/';

  // Create config with env vars and defaults
  const config = {
    // Log level: debug, info, warn, error
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // CertStream WebSocket URL - this becomes the main URL for CertStream
    certstreamWsUrl: process.env.CERTSTREAM_WS_URL || defaultCertStreamUrl,
    
    // CT Log Providers - comma-separated list of enabled providers
    enabledProviders: (process.env.ENABLED_PROVIDERS || 'certstream').split(',').map(p => p.trim()),
    
    // Polling interval in milliseconds (for HTTP-based providers)
    pollingInterval: parseInt(process.env.POLLING_INTERVAL || '60000', 10),
    
    // Maximum entries to fetch per request
    maxEntriesPerRequest: parseInt(process.env.MAX_ENTRIES_PER_REQUEST || '100', 10),
    
    // Output type: json or text
    outputType: process.env.OUTPUT_TYPE || 'json',
    
    // Output format: pretty or raw
    outputFormat: process.env.OUTPUT_FORMAT || 'pretty',
    
    // Output file path (empty for terminal output only)
    outputFile: process.env.OUTPUT_FILE || '',
    
    // Quiet mode - output only certificate data, no logs
    quiet: process.env.QUIET === 'true' || false,
    
    // Certificate cache configuration for deduplication
    certificateCache: {
      enabled: process.env.CERTIFICATE_CACHE_ENABLED === 'true' || false,
      cacheTTL: parseInt(process.env.CERTIFICATE_CACHE_TTL || '3600', 10), // 1 hour default
      cleanupInterval: parseInt(process.env.CERTIFICATE_CACHE_CLEANUP_INTERVAL || '60000', 10), // 1 minute default
    },
    
    // Module system configuration
    modules: {
      // Enable module system
      enabled: process.env.MODULES_ENABLED === 'true' || false,
      // Directory containing modules
      modulesDir: process.env.MODULES_DIR || './modules',
      // Module-specific configurations
      moduleConfigs: JSON.parse(process.env.MODULE_CONFIGS || '{}'),
    },
    
    // Provider-specific configurations
    providers: {
      google: {
        apiEndpoint: 'https://ct.googleapis.com/logs/argon2023/',
      },
      cloudflare: {
        apiEndpoint: 'https://ct.cloudflare.com/logs/nimbus2023/',
      },
      certstream: {
        wsUrl: process.env.CERTSTREAM_WS_URL || defaultCertStreamUrl,
      },
    },
  };
  
  // Override with command line options
  if (cliOptions.logLevel) {
    config.logLevel = cliOptions.logLevel;
  }
  
  if (cliOptions.url) {
    // Update both the config property and the provider-specific property
    config.certstreamWsUrl = cliOptions.url;
    // Ensure the provider-specific config exists
    if (!config.providers) config.providers = {};
    if (!config.providers.certstream) config.providers.certstream = {};
    config.providers.certstream.wsUrl = cliOptions.url;
  }
  
  if (cliOptions.providers) {
    config.enabledProviders = cliOptions.providers.split(',').map(p => p.trim());
  }
  
  if (cliOptions.pollingInterval) {
    config.pollingInterval = parseInt(cliOptions.pollingInterval, 10);
  }
  
  if (cliOptions.maxEntries) {
    config.maxEntriesPerRequest = parseInt(cliOptions.maxEntries, 10);
  }
  
  if (cliOptions.outputType) {
    config.outputType = cliOptions.outputType;
  }
  
  if (cliOptions.outputFormat) {
    config.outputFormat = cliOptions.outputFormat;
  }
  
  if (cliOptions.outputFile) {
    config.outputFile = cliOptions.outputFile;
  }
  
  // Handle quiet mode flag
  if (cliOptions.quiet !== undefined) {
    config.quiet = cliOptions.quiet;
  }
  
  // Handle certificate cache configuration
  if (cliOptions.cache !== undefined) {
    config.certificateCache.enabled = cliOptions.cache === 'true' || cliOptions.cache === true;
  }
  
  if (cliOptions.cacheTTL) {
    config.certificateCache.cacheTTL = parseInt(cliOptions.cacheTTL, 10);
  }
  
  if (cliOptions.cacheCleanupInterval) {
    config.certificateCache.cleanupInterval = parseInt(cliOptions.cacheCleanupInterval, 10);
  }
  
  // Handle module system configuration
  if (cliOptions.modules !== undefined) {
    config.modules.enabled = cliOptions.modules === 'true' || cliOptions.modules === true;
  }
  
  if (cliOptions.modulesDir) {
    config.modules.modulesDir = cliOptions.modulesDir;
  }
  
  if (cliOptions.moduleConfigs) {
    // Parse JSON string if provided
    config.modules.moduleConfigs = typeof cliOptions.moduleConfigs === 'string' ? JSON.parse(cliOptions.moduleConfigs) : cliOptions.moduleConfigs;
  }
  
  return config;
}

module.exports = {
  createConfig,
};