# CT-Stream Modules

The CT-Stream module system allows for extensible certificate processing capabilities. Modules are specialized components that can process certificates in various ways, such as extracting domains, analyzing certificate patterns, or generating intelligence from certificate data.

## Available Modules

The following modules are included with CT-Stream:

### Domain Extractor

The Domain Extractor module (`domain-extractor.js`) extracts, normalizes, and tracks domains from certificates. It provides capabilities for:

- Extracting domains from certificates
- Tracking new vs. previously seen domains
- Handling wildcard domains
- Normalizing domain names
- Providing statistics about domain observations

Usage:

```javascript
const DomainExtractor = require('ct-stream/modules/domain-extractor');
const { createClient } = require('ct-stream');

// Create the extractor with options
const extractor = new DomainExtractor({
  maxDomains: 100000,     // Maximum domains to track
  trackWildcards: true,   // Whether to track wildcard domains
  normalizeNames: true    // Whether to normalize domain names
});

// Initialize the extractor
await extractor.initialize();

// Create and start the client
const client = createClient();

// Process certificates with the extractor
client.on('certificate', async (certificate) => {
  const result = await extractor.process(certificate);
  
  if (result.newDomains.length > 0) {
    console.log('New domains:', result.newDomains);
  }
});

// Start monitoring
await client.start();
```

## Creating Custom Modules

You can create custom modules by extending the `CertificateModule` base class. Custom modules can implement specialized logic for certificate processing, such as:

- Detecting phishing domains
- Monitoring certificates for specific organizations
- Analyzing certificate patterns
- Generating security intelligence

### Module Structure

A custom module should extend the `CertificateModule` class and implement at least the `process` method:

```javascript
const CertificateModule = require('ct-stream/src/lib/certificate-module');

class CustomModule extends CertificateModule {
  constructor(options = {}, logger = console) {
    super(options, logger);
    
    // Custom initialization
    this.customState = {};
  }
  
  async initialize() {
    // Call parent initialization
    await super.initialize();
    
    // Custom initialization logic
    // ...
    
    return Promise.resolve();
  }
  
  async process(certificate) {
    // Call parent processing
    await super.process(certificate);
    
    // Custom processing logic
    // ...
    
    return {
      processed: true,
      moduleType: this.constructor.name,
      // Custom result properties
    };
  }
  
  getStats() {
    // Get base stats from parent
    const baseStats = super.getStats();
    
    // Add custom stats
    return {
      ...baseStats,
      custom: {
        // Custom statistics
      }
    };
  }
}

module.exports = CustomModule;
```

### Module Best Practices

1. **Efficiency**: Process certificates efficiently to handle high volumes
2. **Error Handling**: Properly handle and report errors
3. **Memory Management**: Be mindful of memory usage in long-running processes
4. **State Management**: Manage module state appropriately
5. **Documentation**: Document the module's purpose, options, and outputs

## Module Manager (Future Enhancement)

In future versions, CT-Stream will include a Module Manager to simplify working with multiple modules:

```javascript
// Future API (not yet implemented)
const { createClient, ModuleManager } = require('ct-stream');
const DomainExtractor = require('ct-stream/modules/domain-extractor');

// Create client
const client = createClient();

// Create module manager
const moduleManager = new ModuleManager();

// Register modules
moduleManager.registerModule('domains', new DomainExtractor());
moduleManager.registerModule('custom', new CustomModule());

// Initialize all modules
await moduleManager.initializeAll();

// Connect module manager to client
client.pipe(moduleManager);

// Start client
await client.start();
```

## Upcoming Modules

The following modules are planned for future releases:

1. **Certificate Intelligence**: Analyze certificate patterns and anomalies
2. **Domain Watchlist**: Monitor certificates for specific domains of interest
3. **Typosquatting Detection**: Identify potential typosquatting domains
4. **Certificate Policy Validator**: Validate certificates against policy requirements