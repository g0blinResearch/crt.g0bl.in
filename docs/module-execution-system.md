# Module Execution System

The CT-Stream project includes a flexible module execution system that allows for processing certificate data through custom modules. This document explains the architecture, functionality, and development process for modules.

## Architecture Overview

The module system follows a plugin architecture pattern, where modules are:

1. **Dynamically loaded** at runtime
2. **Independently configured**
3. **Executed in parallel** when possible
4. **Result cached** to improve performance

```
+-------------------+     +--------------------+     +-------------------+
|                   |     |                    |     |                   |
| Certificate Data  |---->| Module Manager     |---->| Execution Results |
|                   |     |                    |     |                   |
+-------------------+     +--------------------+     +-------------------+
                           |               |
                           v               v
                  +-------------------+   +-------------------+
                  |                   |   |                   |
                  | Module 1          |   | Module 2          |
                  |                   |   |                   |
                  +-------------------+   +-------------------+
```

## Core Components

### Module Manager

The Module Manager (`src/lib/module-manager.js`) is responsible for:

- Discovering and loading modules from the modules directory
- Initializing modules with their configurations
- Executing modules for each certificate
- Aggregating and returning module results
- Managing module lifecycle (initialization, execution, cleanup)

### Module Loader

The Module Loader (`src/lib/module-loader.js`) handles:

- Finding module files in the modules directory
- Validating module structure and required methods
- Instantiating module classes with proper configuration
- Reporting module loading status

### Certificate Module Base Class

The Certificate Module base class (`src/lib/certificate-module.js`) provides:

- Standard interface for all modules
- Common utility methods
- Lifecycle management (init, process, destroy)
- Error handling and reporting

## Module Lifecycle

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│  Initialization ├────────►│  Execution      ├────────►│  Cleanup        │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
        │                          │                           │
        ▼                          ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ - Load module   │         │ - Process cert  │         │ - Close         │
│ - Parse config  │         │ - Return result │         │   connections   │
│ - Init resources│         │ - Cache result  │         │ - Free resources│
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

1. **Initialization**: When the Module Manager starts, it loads all modules, validates them, and calls their `initialize()` method with the provided configuration.

2. **Execution**: For each certificate received, the Module Manager calls the `process()` method on each module, passing the certificate data.

3. **Cleanup**: When the application shuts down, the Module Manager calls the `destroy()` method on each module to release resources.

## Creating a Module

### Module Structure

Each module must be a class with the following structure:

```javascript
class MyModule {
  /**
   * Constructor (required)
   * @param {Object} config - Module configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config || {};
    this.logger = logger;
    this.name = 'my-module'; // Required: unique module name
  }

  /**
   * Initialize module (optional)
   * @returns {Promise<void>}
   */
  async initialize() {
    // Set up resources, connections, etc.
    this.logger.debug(`${this.name} initialized`);
  }

  /**
   * Process a certificate (required)
   * @param {Object} certificate - Certificate data
   * @returns {Promise<Object>} - Processing result
   */
  async process(certificate) {
    // Process certificate and return result
    return {
      // Your result data here
    };
  }

  /**
   * Clean up resources (optional)
   * @returns {Promise<void>}
   */
  async destroy() {
    // Close connections, free resources, etc.
    this.logger.debug(`${this.name} destroyed`);
  }
}

module.exports = MyModule;
```

### Module Configuration

Modules receive their configuration from two sources:
1. Command-line arguments (`--module-configs`)
2. Code-defined defaults

Example configuration format:
```json
{
  "domain-watchlist": {
    "enabled": true,
    "domains": ["example.com", "test.com"],
    "alertThreshold": 5
  },
  "certificate-intelligence": {
    "enabled": true,
    "maxCertificates": 1000
  }
}
```

### Example Module: Domain Watchlist

The Domain Watchlist module scans certificates for specific domains of interest:

```javascript
class DomainWatchlist {
  constructor(config, logger) {
    this.config = config || {};
    this.logger = logger;
    this.name = 'domain-watchlist';
    
    // Default configuration
    this.domains = this.config.domains || [];
    this.alertThreshold = this.config.alertThreshold || 1;
    this.alerts = 0;
  }
  
  async initialize() {
    this.logger.info(`Domain Watchlist initialized with ${this.domains.length} domains`);
  }
  
  async process(certificate) {
    // Extract domains from certificate
    const certDomains = this.extractDomains(certificate);
    
    // Check for matches against watchlist
    const matches = certDomains.filter(domain => 
      this.domains.some(watchDomain => 
        domain === watchDomain || domain.endsWith(`.${watchDomain}`)
      )
    );
    
    if (matches.length > 0) {
      this.alerts++;
      
      return {
        matched: true,
        domains: matches,
        alertCount: this.alerts
      };
    }
    
    return {
      matched: false
    };
  }
  
  extractDomains(certificate) {
    // Extract domains from certificate
    // (Implementation omitted for brevity)
  }
}

module.exports = DomainWatchlist;
```

## Execution Flow

When a certificate is received:

1. The main application calls `moduleManager.execute(certificate)`
2. The Module Manager checks if any modules are loaded and enabled
3. For each enabled module:
   - The `process()` method is called with the certificate
   - Execution time is measured
   - Results are captured (or errors caught)
4. All results are aggregated into a single object with module names as keys
5. The aggregated results are returned to the caller

```javascript
// Example execution flow
const certificate = { /* certificate data */ };
const results = await moduleManager.execute(certificate);

// Results format
{
  "domain-watchlist": {
    matched: true,
    domains: ["example.com"],
    alertCount: 3,
    executionTime: 5 // ms
  },
  "certificate-intelligence": {
    risk: "low",
    factors: ["well-known-ca", "standard-validity"],
    executionTime: 12 // ms
  }
}
```

## Performance Considerations

### Parallel Execution

The Module Manager executes all modules in parallel using `Promise.all()` for better performance:

```javascript
async execute(certificate) {
  // Execute all modules in parallel
  const executions = this.modules.map(module => this.executeModule(module, certificate));
  const results = await Promise.all(executions);
  
  // Combine results
  return results.reduce((acc, result) => {
    if (result && result.moduleName) {
      acc[result.moduleName] = result.data;
    }
    return acc;
  }, {});
}
```

### Result Caching

For computationally expensive operations, modules can use the provided cache:

```javascript
async process(certificate) {
  // Generate cache key
  const key = `${this.name}:${certificate.data.leaf_cert.fingerprint}`;
  
  // Check cache first
  const cached = await this.cache.get(key);
  if (cached) {
    return cached;
  }
  
  // Perform expensive operation
  const result = /* expensive computation */;
  
  // Cache result for future use
  await this.cache.set(key, result, 3600); // 1 hour TTL
  
  return result;
}
```

## Error Handling

The Module Manager catches and logs errors from individual modules without affecting the main application:

```javascript
async executeModule(module, certificate) {
  try {
    const startTime = Date.now();
    const result = await module.process(certificate);
    const executionTime = Date.now() - startTime;
    
    return {
      moduleName: module.name,
      data: {
        ...result,
        executionTime
      }
    };
  } catch (error) {
    this.logger.error(`Error executing module ${module.name}: ${error.message}`);
    return {
      moduleName: module.name,
      data: {
        error: error.message,
        executionTime: 0
      }
    };
  }
}
```

## Best Practices for Module Development

1. **Keep modules focused**: Each module should have a single responsibility.
2. **Handle errors gracefully**: Catch and handle errors within your module.
3. **Use async/await**: All module methods should be async for consistent handling.
4. **Log appropriately**: Use the provided logger for consistent log format.
5. **Clean up resources**: Implement the destroy method to prevent resource leaks.
6. **Cache expensive results**: Use the cache for computationally expensive operations.
7. **Make configuration optional**: Provide sensible defaults for all configuration options.
8. **Return structured data**: Results should be structured objects, not primitive values.
9. **Minimize dependencies**: Keep external dependencies to a minimum.
10. **Document your module**: Include JSDoc comments for all methods.

## Testing Modules

To test a module independently:

```javascript
const MyModule = require('./modules/my-module');
const logger = { info: console.log, debug: console.log, error: console.error };
const config = { /* your config */ };

async function testModule() {
  // Create module instance
  const module = new MyModule(config, logger);
  
  // Initialize
  await module.initialize();
  
  // Process a test certificate
  const certificate = { /* test certificate data */ };
  const result = await module.process(certificate);
  
  console.log('Module result:', result);
  
  // Clean up
  await module.destroy();
}

testModule().catch(console.error);