# Getting Started with CT-Stream

This guide will help you get started with CT-Stream, explaining how to install, configure, and use the library for monitoring Certificate Transparency logs.

## Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [JSON Stream](#json-stream)
- [Advanced Configuration](#advanced-configuration)
- [Modules](#modules)
- [Working with Certificates](#working-with-certificates)
- [Domain Extraction](#domain-extraction)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Installation

Install the package using npm:

```bash
npm install ct-stream
```

Or clone the repository for development:

```bash
git clone https://github.com/yourusername/ct-stream.git
cd ct-stream
npm install
```

## Basic Usage

### Creating a Client

The simplest way to use CT-Stream is to create a client and listen for certificate events:

```javascript
const { createClient } = require('ct-stream');

// Create a client with default options
const client = createClient();

// Listen for certificate events
client.on('certificate', (certificate) => {
  console.log('New certificate detected:');
  console.log(certificate.data.leaf_cert.subject.CN);
});

// Start monitoring
client.start()
  .then(() => console.log('Monitoring started'))
  .catch(error => console.error(`Error: ${error.message}`));

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await client.stop();
  process.exit(0);
});
```

### Available Events

The client emits the following events:

- `connected`: Emitted when connected to the CT log stream
- `disconnected`: Emitted when disconnected from the CT log stream
- `certificate`: Emitted when a new certificate is detected
- `heartbeat`: Emitted for heartbeat messages (if not skipped)
- `error`: Emitted when an error occurs

## JSON Stream

### Real-time JSON Certificate Data

For applications that need a clean JSON output of certificate data in real-time, we provide a ready-to-use JSON stream example:

```javascript
const CTStreamMonitor = require('ct-stream');

// Create the CT stream monitor
const monitor = new CTStreamMonitor({
  provider: {
    url: 'wss://certstream.calidog.io/',
    skipHeartbeats: true
  },
  cache: {
    enabled: false // Disable cache to reduce memory usage
  }
});

// Listen for certificates
monitor.on('certificate', (data) => {
  const { certificate, timestamp } = data;
  
  // Output as JSON
  console.log(JSON.stringify({
    timestamp,
    commonName: certificate.commonName,
    issuer: certificate.issuer,
    domains: certificate.domains
  }));
});

// Start the monitor
monitor.start();
```

### Running the JSON Stream Example

We provide convenient scripts to run the JSON stream example:

On Linux/macOS:
```bash
./scripts/run-json-stream.sh
```

On Windows:
```batch
scripts\run-json-stream.bat
```

This will start streaming certificate data in JSON format to your terminal:

```json
{"timestamp":"2025-03-05T23:30:45.123Z","commonName":"example.com","issuer":"Let's Encrypt Authority X3","validFrom":"2025-03-05T22:30:45.000Z","validTo":"2025-06-03T22:30:45.000Z","domains":["example.com","www.example.com"]}
{"timestamp":"2025-03-05T23:30:46.456Z","commonName":"another-site.org","issuer":"DigiCert SHA2 Secure Server CA","validFrom":"2025-03-05T00:00:00.000Z","validTo":"2026-03-04T23:59:59.000Z","domains":["another-site.org"]}
```

## Advanced Configuration

You can customize the client by passing options to the `createClient` function:

```javascript
const { createClient } = require('ct-stream');

// Create a client with custom options
const client = createClient({
  // Provider options
  provider: {
    url: 'wss://certstream.calidog.io/',
    skipHeartbeats: true,
    reconnectDelay: 1000,
    maxReconnectAttempts: 10
  },
  
  // Caching options
  enableCache: true,
  cacheTTL: 3600, // 1 hour
  
  // Load and configure modules
  modules: {
    // Add your custom modules here
  },
  
  // Module-specific options
  moduleOptions: {
    // Add module-specific options here
  }
});
```

## Modules

CT-Stream uses a modular architecture to process certificates. Each module can perform specific tasks, such as extracting domains, analyzing certificate details, or storing data.

### Using Built-in Modules

```javascript
const { createClient, DomainExtractor } = require('ct-stream');

// Create a client with the domain extractor module
const client = createClient({
  modules: {
    domainExtractor: DomainExtractor
  },
  moduleOptions: {
    domainExtractor: {
      maxDomains: 100000,
      trackWildcards: true
    }
  }
});

// Access the module after initialization
client.start().then(() => {
  const extractor = client.getModule('domainExtractor');
  
  // Get statistics
  console.log(extractor.getStats());
  
  // Check if a domain exists
  if (extractor.hasDomain('example.com')) {
    console.log('Domain found!');
  }
});
```

### Creating Custom Modules

You can create custom modules by extending the `CertificateModule` class:

```javascript
const { CertificateModule } = require('ct-stream');

class MyCustomModule extends CertificateModule {
  constructor(options = {}, logger = console) {
    super(options, logger);
    // Initialize your module
  }
  
  async _processImpl(certificate) {
    // Process the certificate
    this.logger.debug('Processing certificate');
    
    // Your custom logic here
    
    return { processed: true };
  }
}

// Use your custom module
const client = createClient({
  modules: {
    myModule: MyCustomModule
  }
});
```

## Working with Certificates

### Certificate Structure

Certificates from the CT logs typically have the following structure:

```javascript
{
  message_type: 'certificate_update',
  data: {
    update_type: 'X509LogEntry',
    leaf_cert: {
      subject: {
        C: 'US',
        ST: 'California',
        L: 'San Francisco',
        O: 'Example, Inc.',
        CN: 'example.com'
      },
      extensions: {
        basicConstraints: 'CA:FALSE',
        keyUsage: 'Digital Signature, Key Encipherment',
        extendedKeyUsage: 'TLS Web Server Authentication, TLS Web Client Authentication',
        subjectAltName: 'DNS:example.com, DNS:www.example.com'
      },
      not_before: '2023-03-01T00:00:00+00:00',
      not_after: '2024-03-01T23:59:59+00:00',
      as_der: '...',
      all_domains: ['example.com', 'www.example.com']
    },
    chain: [ /* certificate chain */ ],
    cert_index: 123456,
    seen: '2023-03-01T12:34:56.789Z',
    source: {
      name: 'Google Argon 2023',
      url: 'ct.googleapis.com/logs/argon2023/'
    }
  }
}
```

### Helper Utilities

CT-Stream provides several utilities for working with certificates:

```javascript
const { CacheUtils } = require('ct-stream');

// Extract domains from a certificate
const domains = CacheUtils.extractDomains(certificate);

// Check if a domain is a wildcard
const isWildcard = CacheUtils.isWildcardDomain('*.example.com');

// Normalize a domain name
const normalized = CacheUtils.normalizeDomain('Example.COM');

// Generate a unique ID for a certificate
const certId = CacheUtils.generateCertificateId(certificate);

// Extract certificate information
const certInfo = CacheUtils.extractCertificateInfo(certificate);

// Check if a certificate is expired
const isExpired = CacheUtils.isCertificateExpired(certificate);

// Calculate days until expiration
const daysLeft = CacheUtils.daysUntilExpiration(certificate);
```

## Domain Extraction

The `DomainExtractor` module extracts and tracks domains from certificates:

```javascript
const { createClient, DomainExtractor } = require('ct-stream');

// Create domain extractor with options
const domainExtractor = new DomainExtractor({
  maxDomains: 100000,
  trackWildcards: true,
  normalizeNames: true
});

// Create client with domain extractor
const client = createClient({
  modules: {
    domainExtractor: DomainExtractor
  },
  moduleOptions: {
    domainExtractor: {
      maxDomains: 100000,
      trackWildcards: true
    }
  }
});

// Start monitoring
client.start().then(() => {
  // Access the module
  const extractor = client.getModule('domainExtractor');
  
  // Save domains to a file after some time
  setTimeout(async () => {
    await extractor.saveDomains('domains.json', {
      format: 'json',
      includeWildcards: true,
      includeMetadata: true
    });
    console.log('Domains saved!');
  }, 60000);
});
```

## API Reference

### CTStreamClient

The main client for monitoring Certificate Transparency logs.

#### Methods

- `start()`: Start monitoring
- `stop()`: Stop monitoring
- `registerModule(name, module)`: Register a module
- `unregisterModule(name)`: Unregister a module
- `getModule(name)`: Get a module by name
- `getModuleNames()`: Get all module names
- `getStats()`: Get client statistics

#### Events

- `connected`: Emitted when connected to the CT log stream
- `disconnected`: Emitted when disconnected from the CT log stream
- `certificate`: Emitted when a new certificate is detected
- `heartbeat`: Emitted for heartbeat messages (if not skipped)
- `error`: Emitted when an error occurs

### CertstreamProvider

Provider for the CertStream service.

#### Methods

- `start()`: Start the provider
- `stop()`: Stop the provider
- `getStats()`: Get provider statistics

#### Events

- `connected`: Emitted when connected to the WebSocket
- `disconnected`: Emitted when disconnected from the WebSocket
- `certificate`: Emitted when a new certificate is detected
- `heartbeat`: Emitted for heartbeat messages (if not skipped)
- `error`: Emitted when an error occurs

### DomainExtractor

Module for extracting domains from certificates.

#### Methods

- `initialize()`: Initialize the module
- `process(certificate)`: Process a certificate
- `hasDomain(domain)`: Check if a domain exists
- `getDomainInfo(domain)`: Get domain information
- `saveDomains(filePath, options)`: Save domains to a file
- `clearDomains()`: Clear all domains
- `getStats()`: Get module statistics

## Troubleshooting

### Connection Issues

If you're having trouble connecting to the CT log stream, try the following:

1. Check your internet connection
2. Verify the WebSocket URL is correct
3. Check for any firewalls or proxy settings that might be blocking the connection
4. Increase the reconnect delay and maximum reconnect attempts

Example:

```javascript
const client = createClient({
  provider: {
    url: 'wss://certstream.calidog.io/',
    reconnectDelay: 5000,
    maxReconnectAttempts: 20
  }
});
```

### Memory Usage

If you're experiencing high memory usage, consider:

1. Limiting the maximum number of domains to track
2. Disabling wildcard domain tracking
3. Periodically clearing the cache
4. Increasing the Node.js heap size with `--max-old-space-size`

Example:

```javascript
const client = createClient({
  enableCache: true,
  cacheTTL: 1800, // 30 minutes
  modules: {
    domainExtractor: DomainExtractor
  },
  moduleOptions: {
    domainExtractor: {
      maxDomains: 50000, // Limit to 50k domains
      trackWildcards: false // Disable wildcard tracking
    }
  }
});

// Periodically clear the cache
setInterval(() => {
  const cache = client.cache;
  if (cache) {
    cache.clearAll();
    console.log('Cache cleared');
  }
}, 3600000); // Every hour
```

### Performance Tuning

For optimal performance:

1. Set `skipHeartbeats: true` to reduce event processing
2. Use the cache system to prevent duplicate processing
3. Implement efficient processing in custom modules
4. Consider implementing a queue for high-volume processing

### Debugging

For debugging issues:

1. Implement a custom logger
2. Check the statistics with `client.getStats()`
3. Run with Node.js debugging enabled: `node --inspect examples/simple-monitor.js`