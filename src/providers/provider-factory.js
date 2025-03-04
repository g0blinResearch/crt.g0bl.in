/**
 * Provider factory for Certificate Transparency Stream Subscriber
 * Creates and returns the appropriate provider based on name
 */

// Import providers
const CertStreamProvider = require('./certstream-provider');

/**
 * Create a provider instance
 * @param {string} providerName - Name of the provider to create
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @returns {Object} Provider instance
 */
function createProvider(providerName, config, logger) {
  switch (providerName.toLowerCase()) {
    case 'certstream':
      // Inject both config and logger
      const providerConfig = {
        ...config,
        logger: logger
      };
      return new CertStreamProvider(providerConfig);

    // Add additional providers as they're implemented
    // case 'google':
    //   return new GoogleProvider(config);
    // case 'cloudflare':
    //   return new CloudflareProvider(config);

    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

module.exports = {
  createProvider
};