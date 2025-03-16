/**
 * CT-Stream
 * 
 * A Node.js library for monitoring Certificate Transparency logs in real-time.
 * 
 * @module ct-stream
 */

const EventEmitter = require('events');
const CertstreamProvider = require('./providers/certstream-provider');
const CertificateModule = require('./lib/certificate-module');
const CacheManager = require('./lib/cache');

/**
 * CT-Stream Monitor
 * 
 * Main class for monitoring Certificate Transparency logs.
 * 
 * @extends EventEmitter
 */
class CTStreamMonitor extends EventEmitter {
  /**
   * Create a new CT-Stream monitor
   * @param {Object} options - Monitor options
   * @param {Object} options.provider - Provider options
   * @param {Object} options.cache - Cache options
   * @param {boolean} options.autoStart - Whether to start monitoring automatically
   * @param {Object} logger - Logger instance
   */
  constructor(options = {}, logger = console) {
    super();
    
    // Set options with defaults
    this.options = {
      provider: {
        url: 'wss://certstream.calidog.io/',
        skipHeartbeats: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 10
      },
      cache: {
        enabled: true,
        certificates: {
          enabled: true,
          maxSize: 10000,
          ttl: 3600 // 1 hour
        },
        domains: {
          enabled: true,
          maxSize: 100000,
          ttl: 86400 // 24 hours
        }
      },
      autoStart: false,
      ...options
    };
    
    this.logger = logger;
    this.running = false;
    this.initialized = false;
    
    // Create provider
    this.provider = new CertstreamProvider(this.options.provider, this.logger);
    
    // Create cache
    if (this.options.cache.enabled) {
      this.cache = new CacheManager(this.options.cache, this.logger);
    }
    
    // Create module registry
    this.modules = new Map();
    
    // Statistics
    this.stats = {
      startTime: null,
      certificatesProcessed: 0,
      modulesRegistered: 0,
      lastCertificateTime: null
    };
    
    // Auto-start if enabled
    if (this.options.autoStart) {
      this.initialize()
        .then(() => this.start())
        .catch(error => {
          this.logger.error(`Error auto-starting monitor: ${error.message}`);
        });
    }
  }
  
  /**
   * Initialize the monitor
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async initialize() {
    try {
      if (this.initialized) {
        this.logger.debug('Monitor already initialized');
        return true;
      }
      
      this.logger.debug('Initializing CT-Stream monitor');
      
      // Initialize cache
      if (this.cache) {
        await this.cache.initialize();
      }
      
      // Initialize modules
      for (const [name, module] of this.modules.entries()) {
        try {
          await module.initialize();
        } catch (error) {
          this.logger.error(`Error initializing module '${name}': ${error.message}`);
        }
      }
      
      // Set up provider event handlers
      this.provider.on('certificate', this._handleCertificate.bind(this));
      this.provider.on('error', this._handleError.bind(this));
      this.provider.on('connected', this._handleConnected.bind(this));
      this.provider.on('disconnected', this._handleDisconnected.bind(this));
      
      this.initialized = true;
      return true;
    } catch (error) {
      this.logger.error(`Error initializing monitor: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Start monitoring
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async start() {
    try {
      if (this.running) {
        this.logger.debug('Monitor already running');
        return true;
      }
      
      // Initialize if needed
      if (!this.initialized) {
        const initialized = await this.initialize();
        
        if (!initialized) {
          return false;
        }
      }
      
      this.logger.debug('Starting CT-Stream monitor');
      
      // Update stats
      this.stats.startTime = Date.now();
      
      // Start provider
      await this.provider.start();
      
      this.running = true;
      return true;
    } catch (error) {
      this.logger.error(`Error starting monitor: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Stop monitoring
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async stop() {
    try {
      if (!this.running) {
        this.logger.debug('Monitor not running');
        return true;
      }
      
      this.logger.debug('Stopping CT-Stream monitor');
      
      // Stop provider
      await this.provider.stop();
      
      this.running = false;
      return true;
    } catch (error) {
      this.logger.error(`Error stopping monitor: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Shut down the monitor
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async shutdown() {
    try {
      // Stop if running
      if (this.running) {
        await this.stop();
      }
      
      this.logger.debug('Shutting down CT-Stream monitor');
      
      // Shut down modules
      for (const [name, module] of this.modules.entries()) {
        try {
          await module.shutdown();
        } catch (error) {
          this.logger.error(`Error shutting down module '${name}': ${error.message}`);
        }
      }
      
      // Shut down cache
      if (this.cache) {
        await this.cache.shutdown();
      }
      
      // Clean up provider event handlers
      this.provider.removeAllListeners();
      
      this.initialized = false;
      return true;
    } catch (error) {
      this.logger.error(`Error shutting down monitor: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Register a module
   * @param {string} name - Module name
   * @param {Object} module - Module instance
   * @returns {boolean} Whether the module was registered
   */
  registerModule(name, module) {
    try {
      if (!name || !module) {
        return false;
      }
      
      // Validate module
      if (!(module instanceof CertificateModule)) {
        this.logger.error(`Invalid module '${name}': must extend CertificateModule`);
        return false;
      }
      
      // Check if module already exists
      if (this.modules.has(name)) {
        this.logger.warn(`Module '${name}' already registered`);
        return false;
      }
      
      // Register module
      this.modules.set(name, module);
      this.stats.modulesRegistered++;
      
      this.logger.debug(`Registered module: ${name}`);
      
      // Initialize module if monitor is already initialized
      if (this.initialized) {
        module.initialize()
          .catch(error => {
            this.logger.error(`Error initializing module '${name}': ${error.message}`);
          });
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error registering module '${name}': ${error.message}`);
      return false;
    }
  }
  
  /**
   * Unregister a module
   * @param {string} name - Module name
   * @returns {boolean} Whether the module was unregistered
   */
  unregisterModule(name) {
    try {
      if (!name) {
        return false;
      }
      
      // Check if module exists
      if (!this.modules.has(name)) {
        return false;
      }
      
      // Get module
      const module = this.modules.get(name);
      
      // Shut down module
      module.shutdown()
        .catch(error => {
          this.logger.error(`Error shutting down module '${name}': ${error.message}`);
        });
      
      // Unregister module
      this.modules.delete(name);
      
      this.logger.debug(`Unregistered module: ${name}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error unregistering module '${name}': ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get a module by name
   * @param {string} name - Module name
   * @returns {Object|null} Module instance or null if not found
   */
  getModule(name) {
    if (!name) {
      return null;
    }
    
    return this.modules.get(name) || null;
  }
  
  /**
   * Get monitor statistics
   * @returns {Object} Monitor statistics
   */
  getStats() {
    // Calculate runtime
    let runTimeMs = 0;
    
    if (this.stats.startTime) {
      runTimeMs = Date.now() - this.stats.startTime;
    }
    
    const runTimeSec = Math.floor(runTimeMs / 1000);
    const runTimeMin = Math.floor(runTimeSec / 60);
    const runTimeHour = Math.floor(runTimeMin / 60);
    
    // Format runtime
    const runTimeFormatted = runTimeHour > 0
      ? `${runTimeHour}h ${runTimeMin % 60}m ${runTimeSec % 60}s`
      : runTimeMin > 0
        ? `${runTimeMin}m ${runTimeSec % 60}s`
        : `${runTimeSec}s`;
    
    // Get provider stats
    const providerStats = this.provider ? this.provider.getStats() : {};
    
    // Get cache stats
    const cacheStats = this.cache ? this.cache.getStats() : {};
    
    // Get module stats
    const moduleStats = {};
    
    for (const [name, module] of this.modules.entries()) {
      moduleStats[name] = module.getStats();
    }
    
    // Return stats
    return {
      monitor: {
        running: this.running,
        initialized: this.initialized,
        startTime: this.stats.startTime ? new Date(this.stats.startTime).toISOString() : null,
        runtime: {
          ms: runTimeMs,
          formatted: runTimeFormatted
        },
        certificates: {
          processed: this.stats.certificatesProcessed,
          lastSeen: this.stats.lastCertificateTime
            ? new Date(this.stats.lastCertificateTime).toISOString()
            : null,
          perSecond: runTimeSec > 0
            ? (this.stats.certificatesProcessed / runTimeSec).toFixed(2)
            : 0
        },
        modules: {
          registered: this.stats.modulesRegistered,
          active: this.modules.size
        }
      },
      provider: providerStats,
      cache: cacheStats,
      modules: moduleStats
    };
  }
  
  /**
   * Handle certificate events from the provider
   * @private
   * @param {Object} certificate - Certificate object
   */
  async _handleCertificate(certificate) {
    try {
      // Update stats
      this.stats.certificatesProcessed++;
      this.stats.lastCertificateTime = Date.now();
      
      // Cache certificate if enabled
      if (this.cache) {
        this.cache.setCertificate(certificate);
      }
      
      // Process certificate with modules
      const moduleResults = {};
      
      for (const [name, module] of this.modules.entries()) {
        try {
          const result = await module.process(certificate);
          moduleResults[name] = result;
        } catch (error) {
          this.logger.error(`Error processing certificate with module '${name}': ${error.message}`);
          moduleResults[name] = { error: error.message };
        }
      }
      
      // Extract certificate info
      const certInfo = CacheManager.CacheUtils.extractCertificateInfo(certificate);
      const timestamp = CacheManager.CacheUtils.formatCertificateTimestamp(certificate);
      
      // Emit certificate event
      this.emit('certificate', {
        certificate: certInfo,
        timestamp,
        moduleResults
      });
    } catch (error) {
      this.logger.error(`Error handling certificate: ${error.message}`);
    }
  }
  
  /**
   * Handle error events from the provider
   * @private
   * @param {Error} error - Error object
   */
  _handleError(error) {
    this.logger.error(`Provider error: ${error.message}`);
    this.emit('error', error);
  }
  
  /**
   * Handle connected events from the provider
   * @private
   */
  _handleConnected() {
    this.logger.debug('Provider connected');
    this.emit('connected');
  }
  
  /**
   * Handle disconnected events from the provider
   * @private
   */
  _handleDisconnected() {
    this.logger.debug('Provider disconnected');
    this.emit('disconnected');
  }
}

// Export main class
module.exports = CTStreamMonitor;

// Export related classes
module.exports.CertstreamProvider = CertstreamProvider;
module.exports.CertificateModule = CertificateModule;
module.exports.Cache = CacheManager;
module.exports.CacheUtils = CacheManager.CacheUtils;