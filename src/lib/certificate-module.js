/**
 * Certificate Module
 * 
 * Base class for certificate processing modules.
 * 
 * @module lib/certificate-module
 */

/**
 * Base class for certificate processing modules
 */
class CertificateModule {
  /**
   * Create a new certificate module
   * @param {Object} options - Module options
   * @param {boolean} options.enabled - Whether the module is enabled
   * @param {boolean} options.trackStats - Whether to track statistics
   * @param {Object} logger - Logger instance
   */
  constructor(options = {}, logger = console) {
    // Set options with defaults
    this.options = {
      enabled: true,
      trackStats: true,
      ...options
    };
    
    this.logger = logger;
    this.initialized = false;
    
    // Initialize statistics
    this.stats = {
      certificatesProcessed: 0,
      certificatesSkipped: 0,
      processingErrors: 0,
      processingTimeMs: 0,
      startTime: Date.now(),
      lastProcessedTime: null
    };
  }
  
  /**
   * Initialize the module
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async initialize() {
    try {
      if (this.initialized) {
        this.logger.debug(`Module already initialized: ${this.constructor.name}`);
        return true;
      }
      
      // Perform initialization
      const success = await this._initializeImpl();
      
      if (success) {
        this.initialized = true;
        this.logger.debug(`Module initialized: ${this.constructor.name}`);
      } else {
        this.logger.error(`Failed to initialize module: ${this.constructor.name}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Error initializing module ${this.constructor.name}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Implementation-specific initialization
   * @protected
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async _initializeImpl() {
    // Default implementation
    return true;
  }
  
  /**
   * Process a certificate
   * @param {Object} certificate - Certificate object
   * @returns {Promise<Object|null>} Promise that resolves to processed data or null if skipped
   */
  async process(certificate) {
    try {
      // Skip if disabled
      if (!this.options.enabled) {
        this.stats.certificatesSkipped++;
        return null;
      }
      
      // Skip invalid certificates
      if (!certificate || !certificate.data || !certificate.data.leaf_cert) {
        this.stats.certificatesSkipped++;
        return null;
      }
      
      // Track stats
      if (this.options.trackStats) {
        this.stats.certificatesProcessed++;
        this.stats.lastProcessedTime = new Date();
      }
      
      // Process certificate
      const startTime = this.options.trackStats ? Date.now() : 0;
      const result = await this._processImpl(certificate);
      
      // Update processing time
      if (this.options.trackStats) {
        this.stats.processingTimeMs += (Date.now() - startTime);
      }
      
      return result;
    } catch (error) {
      // Track errors
      if (this.options.trackStats) {
        this.stats.processingErrors++;
      }
      
      this.logger.error(`Error processing certificate in ${this.constructor.name}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Implementation-specific certificate processing
   * @protected
   * @param {Object} certificate - Certificate object
   * @returns {Promise<Object|null>} Promise that resolves to processed data or null if skipped
   */
  async _processImpl(certificate) {
    // Default implementation (does nothing)
    return null;
  }
  
  /**
   * Shut down the module
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async shutdown() {
    try {
      // Perform shutdown
      const success = await this._shutdownImpl();
      
      if (success) {
        this.initialized = false;
        this.logger.debug(`Module shut down: ${this.constructor.name}`);
      } else {
        this.logger.error(`Failed to shut down module: ${this.constructor.name}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Error shutting down module ${this.constructor.name}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Implementation-specific shutdown
   * @protected
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async _shutdownImpl() {
    // Default implementation
    return true;
  }
  
  /**
   * Get module statistics
   * @returns {Object} Module statistics
   */
  getStats() {
    // Calculate runtime
    const runTimeMs = Date.now() - this.stats.startTime;
    const runTimeSec = Math.floor(runTimeMs / 1000);
    const runTimeMin = Math.floor(runTimeSec / 60);
    const runTimeHour = Math.floor(runTimeMin / 60);
    
    // Format runtime
    const runTimeFormatted = runTimeHour > 0
      ? `${runTimeHour}h ${runTimeMin % 60}m ${runTimeSec % 60}s`
      : runTimeMin > 0
        ? `${runTimeMin}m ${runTimeSec % 60}s`
        : `${runTimeSec}s`;
    
    // Calculate average processing time
    const avgProcessingTimeMs = this.stats.certificatesProcessed > 0
      ? this.stats.processingTimeMs / this.stats.certificatesProcessed
      : 0;
    
    // Return stats
    return {
      module: {
        name: this.constructor.name,
        enabled: this.options.enabled,
        initialized: this.initialized
      },
      certificates: {
        processed: this.stats.certificatesProcessed,
        skipped: this.stats.certificatesSkipped,
        errors: this.stats.processingErrors
      },
      performance: {
        totalProcessingTimeMs: this.stats.processingTimeMs,
        avgProcessingTimeMs,
        certificatesPerSecond: runTimeSec > 0
          ? (this.stats.certificatesProcessed / runTimeSec).toFixed(2)
          : 0
      },
      runtime: {
        startTime: new Date(this.stats.startTime).toISOString(),
        lastProcessedTime: this.stats.lastProcessedTime
          ? this.stats.lastProcessedTime.toISOString()
          : null,
        runTimeMs,
        runTimeFormatted
      }
    };
  }
  
  /**
   * Reset module statistics
   */
  resetStats() {
    this.stats = {
      certificatesProcessed: 0,
      certificatesSkipped: 0,
      processingErrors: 0,
      processingTimeMs: 0,
      startTime: Date.now(),
      lastProcessedTime: null
    };
  }
}

module.exports = CertificateModule;