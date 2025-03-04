/**
 * Base provider interface for Certificate Transparency Log providers
 */
const EventEmitter = require('events');

/**
 * Base class for all CT Log providers
 * This serves as the interface that all specific providers must implement
 */
class BaseProvider extends EventEmitter {
  /**
   * Create a new provider instance
   * @param {Object} options - Provider configuration options
   */
  constructor(options = {}) {
    super();
    this.options = options;
    this.name = 'base-provider';
    this.isConnected = false;
    this.isRunning = false;
    
    // Get logger from options or create a minimal console logger
    this.logger = options.logger || {
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
      success: console.log
    };
    
    // Set up event handling
    this.on('error', this.handleError.bind(this));
    this.on('certificate', this.handleCertificate.bind(this));
  }

  /**
   * Initialize the provider (to be implemented by subclasses)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Method initialize() must be implemented by subclass');
  }

  /**
   * Connect to the CT Log provider (to be implemented by subclasses)
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error('Method connect() must be implemented by subclass');
  }

  /**
   * Disconnect from the CT Log provider (to be implemented by subclasses)
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('Method disconnect() must be implemented by subclass');
  }

  /**
   * Start monitoring for new certificates
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn(`Provider ${this.name} is already running`);
      return;
    }

    try {
      await this.connect();
      this.isRunning = true;
      this.logger.info(`Provider ${this.name} started`);
    } catch (error) {
      this.logger.error(`Failed to start provider ${this.name}:`, error.message);
      this.emit('error', error);
    }
  }

  /**
   * Stop monitoring for new certificates
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      this.logger.warn(`Provider ${this.name} is not running`);
      return;
    }

    try {
      await this.disconnect();
      this.isRunning = false;
      this.logger.info(`Provider ${this.name} stopped`);
    } catch (error) {
      this.logger.error(`Failed to stop provider ${this.name}:`, error.message);
      this.emit('error', error);
    }
  }

  /**
   * Default error handler
   * @param {Error} error - The error that occurred
   * @private
   */
  handleError(error) {
    this.logger.error(`Provider ${this.name} error:`, error.message);
  }

  /**
   * Default certificate handler
   * @param {Object} certificate - The certificate data
   * @private
   */
  handleCertificate(certificate) {
    // This method is typically overridden by the main application
    // But we provide a default implementation for debugging
    this.logger.debug(`Certificate received from ${this.name}`);
  }

  /**
   * Check connection status
   * @returns {boolean} - Whether the provider is connected
   */
  isConnected() {
    return this.isConnected;
  }

  /**
   * Check running status
   * @returns {boolean} - Whether the provider is running
   */
  isRunning() {
    return this.isRunning;
  }

  /**
   * Check if the provider is healthy
   * @returns {Promise<boolean>} - Whether the provider is healthy
   */
  async isHealthy() {
    return this.isConnected && this.isRunning;
  }
}

module.exports = BaseProvider;