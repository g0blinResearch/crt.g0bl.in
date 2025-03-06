# CT-Stream

A Node.js library for monitoring Certificate Transparency logs in real-time.

## Overview

CT-Stream provides real-time access to Certificate Transparency (CT) logs, allowing you to monitor newly issued SSL/TLS certificates as they are published. This enables a variety of use cases including:

- Security monitoring for your domains
- Brand protection and phishing detection
- Research on certificate issuance patterns
- Tracking SSL/TLS adoption trends
- Integration with security tools and workflows

The library connects to public Certificate Transparency log aggregators (such as CertStream) and provides a simple, event-driven API for consuming and processing certificate data.

## Features

- **Real-time monitoring** of Certificate Transparency logs
- **Efficient caching system** for certificates and domains
- **Modular architecture** for easy extension and customization
- **Pre-built scripts** for common use cases
- **Domain extraction and analysis**
- **Easy-to-use API** with event-driven design
- **Comprehensive documentation** and examples
- **Cross-platform support** (Windows, macOS, Linux)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ct-stream.git
cd ct-stream

# Install dependencies
npm install
```

## Quick Start

The quickest way to get started is to use the JSON stream script:

```bash
# On Linux/macOS
./scripts/run-json-stream.sh

# On Windows
scripts\run-json-stream.bat
```

This will connect to the Certificate Transparency stream and output certificates as JSON objects.

## Usage Examples

### Basic Monitoring

```javascript
const CTStreamMonitor = require('./src/index');

// Create a monitor
const monitor = new CTStreamMonitor();

// Listen for certificates
monitor.on('certificate', (data) => {
  console.log(`New certificate: ${data.certificate.commonName}`);
  console.log(`Domains: ${data.certificate.domains.join(', ')}`);
});

// Start monitoring
monitor.initialize()
  .then(() => monitor.start())
  .catch(console.error);
```

### Filtering by Domain

```javascript
// Using the JSON stream script
node scripts/json-stream.js --domain "example.com"
```

### Getting Pretty JSON Output

```bash
node scripts/json-stream.js --pretty
```

### Piping to Other Tools

```bash
# Count certificates per minute
node scripts/json-stream.js | jq -c '{timestamp: .timestamp}' | awk -F'"' '{print $4}' | cut -c1-16 | uniq -c
```

## Available Scripts

- `json-stream.js` - Outputs certificate data as JSON
- `certstream-demo.js` - Demonstrates the library's capabilities with a time-limited run
- `run-json-stream.sh` / `run-json-stream.bat` - Convenience scripts for running the JSON stream

## Architecture

CT-Stream is built with a modular architecture:

```
ct-stream/
├── src/                  # Core library files
│   ├── providers/        # Data providers (CertStream, etc.)
│   └── lib/              # Utility modules and shared code
├── modules/              # Extension modules
├── examples/             # Example applications
└── scripts/              # Utility scripts
```

### Core Components

- **CTStreamMonitor**: The main class that coordinates the monitoring process
- **CertstreamProvider**: Connects to the CertStream WebSocket service
- **Cache**: Efficient in-memory cache for certificates and domains
- **CertificateModule**: Base class for custom certificate processing modules

## Data Flow

1. The provider connects to a Certificate Transparency log aggregator
2. New certificates are received as events
3. Certificates are parsed and normalized
4. Certificates are cached (if enabled)
5. Events are emitted for consumers
6. Optional processing modules can perform additional analysis

## Cache System

The library includes an efficient in-memory cache system for certificates and domains:

- All caching functionality is implemented in a single module (`src/lib/cache.js`)
- Provides `CacheManager`, `LruCache`, and `CacheUtils` in one consolidated file
- LRU (Least Recently Used) eviction policy
- Configurable maximum sizes
- Optional TTL (Time-To-Live) settings
- Statistics tracking
- Support for different certificate formats

## Extension Modules

You can extend the library with custom modules:

```javascript
const CTStreamMonitor = require('./src/index');
const CertificateModule = require('./src/lib/certificate-module');

// Create a custom module
class MyCustomModule extends CertificateModule {
  async process(certificate) {
    // Process the certificate
    return { result: 'processed' };
  }
}

// Create a monitor
const monitor = new CTStreamMonitor();

// Register the module
monitor.registerModule('my-module', new MyCustomModule());
```

## API Reference

### CTStreamMonitor

The main class for monitoring Certificate Transparency logs.

```javascript
const monitor = new CTStreamMonitor({
  // Provider options
  provider: {
    url: 'wss://certstream.calidog.io/',
    skipHeartbeats: true
  },
  
  // Cache options
  cache: {
    enabled: true,
    certificates: {
      enabled: true,
      maxSize: 10000
    }
  },
  
  // Auto-start monitoring
  autoStart: false
});
```

#### Events

- `certificate` - Emitted when a new certificate is received
- `error` - Emitted when an error occurs
- `connected` - Emitted when connected to the CT log stream
- `disconnected` - Emitted when disconnected from the CT log stream

#### Methods

- `initialize()` - Initialize the monitor
- `start()` - Start monitoring
- `stop()` - Stop monitoring
- `shutdown()` - Shut down the monitor
- `registerModule(name, module)` - Register a processing module
- `unregisterModule(name)` - Unregister a processing module
- `getStats()` - Get monitoring statistics

## Future Enhancements

Planned features for future releases:

- Additional Certificate Transparency log providers
- Persistent storage options for certificates and domains
- Real-time alerting system
- Integration with other security tools
- REST API for querying certificate data
- Advanced filtering and analysis capabilities

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [CertStream](https://certstream.calidog.io/) for providing the Certificate Transparency stream
- The [Certificate Transparency](https://certificate.transparency.dev/) project