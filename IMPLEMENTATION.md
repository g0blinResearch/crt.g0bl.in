# CT-Stream Implementation Guide

This guide provides practical information on using and extending the CT-Stream application.

## Running the Application

### Basic Usage

The application can be run using npm scripts defined in package.json:

```bash
# Run with default settings (JSON output)
npm start

# Run with text output and pretty formatting
npm run start:text

# Run with certificate deduplication cache enabled
npm run start:with-cache

# Run with module system enabled
npm run start:with-modules

# Show help and available options
npm run help
```

Alternatively, run directly with Node.js and custom options:

```bash
node src/index.js --output-type json --output-format pretty --cache true
```

### Quick Demo

To quickly see Certificate Transparency in action without setting up the full application:

```bash
node scripts/certstream-demo.js
```

This will connect to the CertStream WebSocket and display certificate information in real-time.

## Understanding the Output

Each certificate record contains:

- **Subject Information**: Details about the domain owner (CN, O, etc.)
- **Domain Names**: The primary domain and alternative names (SANs)
- **Validity Period**: When the certificate was issued and when it expires
- **Issuer**: The Certificate Authority that issued the certificate
- **Metadata**: Additional information such as certificate fingerprints

Example JSON output:

```json
{
  "message_type": "certificate_update",
  "data": {
    "leaf_cert": {
      "subject": {
        "CN": "example.com",
        "O": "Example Organization"
      },
      "extensions": {
        "subjectAltName": "DNS:example.com, DNS:www.example.com"
      },
      "not_before": 1609459200,
      "not_after": 1640995199,
      "fingerprint": "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90"
    }
  }
}
```

## Project Structure

```
ct-stream/
├── src/                    # Main source code
│   ├── formatters/         # Output formatters
│   ├── lib/                # Core functionality
│   ├── providers/          # CT log providers
│   └── index.js            # Entry point
├── modules/                # Pluggable modules
├── scripts/                # Utility scripts
├── docs/                   # Documentation
└── test/                   # Tests (future)
```

## Core Components

### Certificate Cache

The certificate cache provides deduplication functionality to prevent processing the same certificate multiple times:

```javascript
// Enable certificate cache
const config = { cacheTTL: 3600, cleanupInterval: 60000 };
const logger = createLogger(config);
const cacheManager = new CacheManager(config, logger);

// Check if a certificate exists in cache
if (cacheManager.certificateExists(certificate)) {
  // Skip duplicate certificate
} else {
  // Process new certificate
  cacheManager.addCertificate(certificate);
}
```

### Providers

The provider system abstracts the connection to different CT log sources:

```javascript
// Create a provider
const { createProvider } = require('./providers/provider-factory');
const provider = createProvider('certstream', config, logger);

// Set up event handlers
provider.on('certificate', (data) => {
  // Process certificate data
});

// Start the provider
await provider.start();
```

### Module System

The module system allows extending functionality without modifying core code:

```javascript
// Initialize module manager
const ModuleManager = require('./lib/module-manager');
const moduleManager = new ModuleManager(config.modules, logger);
await moduleManager.initialize();

// Execute modules for a certificate
const results = await moduleManager.execute(certificate);
```

## Developing Modules

Create a new file in the `modules` directory:

```javascript
/**
 * Example Module
 * Performs analysis on certificate data
 */
class ExampleModule {
  constructor(config, logger) {
    this.config = config || {};
    this.logger = logger;
    this.name = 'example-module';
  }

  /**
   * Process a certificate
   * @param {Object} certificate - Certificate data
   * @returns {Object} - Processing result
   */
  async process(certificate) {
    // Extract domains
    const domains = this.extractDomains(certificate);
    
    // Perform analysis
    const result = {
      domainCount: domains.length,
      domains: domains
    };
    
    return result;
  }
  
  /**
   * Extract domains from certificate
   * @param {Object} certificate - Certificate data
   * @returns {Array<String>} - List of domains
   */
  extractDomains(certificate) {
    const domains = new Set();
    
    // Add leaf certificate CN
    if (certificate.data?.leaf_cert?.subject?.CN) {
      domains.add(certificate.data.leaf_cert.subject.CN);
    }
    
    // Add SANs
    if (certificate.data?.leaf_cert?.extensions?.subjectAltName) {
      const sans = certificate.data.leaf_cert.extensions.subjectAltName;
      const dnsNames = sans.match(/DNS:[^,]+/g) || [];
      
      for (const dns of dnsNames) {
        domains.add(dns.replace('DNS:', '').trim());
      }
    }
    
    return [...domains]; // Convert Set to Array
  }
}

module.exports = ExampleModule;
```

## Testing

### Test the Cache

Run the cache test script to verify the certificate deduplication functionality:

```bash
node scripts/test-cache.js
```

### Test with the Demo Script

Run the demo script to see CT logs in real-time:

```bash
node scripts/certstream-demo.js
```

## Troubleshooting

### Common Issues

1. **Connection Errors**: If you experience connection issues with the CertStream WebSocket, try using an alternative URL or check network connectivity.

2. **High CPU Usage**: When processing large volumes of certificates, consider:
   - Increasing the cache TTL to improve deduplication
   - Disabling modules that aren't needed
   - Implementing more efficient filtering

3. **Module Errors**: If modules fail to execute, check:
   - Module configuration
   - Module dependencies
   - Error handling in module code

### Debug Mode

Run the application in debug mode to see more detailed logs:

```bash
npm run dev
```

## Next Steps

After getting familiar with the basic functionality, consider:

1. Implementing a custom module for your specific use case
2. Adding a new CT log provider
3. Creating a persistent storage solution for certificates
4. Contributing improvements to the core codebase