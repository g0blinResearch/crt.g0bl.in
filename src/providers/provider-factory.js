/**
 * Provider factory for Certificate Transparency Stream Subscriber
 * Creates and returns the appropriate provider based on name
 */

// Import providers
const GoogleCTProvider = require('./google-ct-provider');

/**
 * Create a provider instance
 * @param {string} providerName - Name of the provider to create
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @returns {Object} Provider instance
 */
function createProvider(providerName, config, logger) {
  switch (providerName.toLowerCase()) {
    case 'google':
    case 'google-ct':
      // Inject both config and logger
      const googleProviderConfig = {
        ...config,
        logger: logger
      };
      return new GoogleCTProvider(googleProviderConfig);

    // Add additional providers as they're implemented
    // case 'cloudflare':
    //   return new CloudflareProvider(config);

    default:
      throw new Error(`Unknown provider: ${providerName}. Available providers: google, google-ct`);
  }
}

module.exports = {
  createProvider
};