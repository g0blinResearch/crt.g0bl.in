/**
 * Module Manager
 * 
 * Manages the certificate processing modules, including loading,
 * execution pipeline, and caching of results.
 */
const ModuleLoader = require('./module-loader');
const CacheManager = require('./cache');

/**
 * Manages certificate processing modules
 */
class ModuleManager {
  /**
   * Constructor
   * @param {Object} config - Module manager configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger, cacheManager = null) {
    this.config = config;
    this.logger = logger;
    this.loader = new ModuleLoader(config, logger);
    this.cache = cacheManager || new CacheManager(config.cache || {}, logger);
    this.modules = [];
  }
  
  /**
   * Initialize the module manager
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.logger.info('Initializing module manager');
      
      // Load modules
      this.modules = await this.loader.loadModules();
      
      // Get enabled modules
      const enabledModules = this.loader.getEnabledModules() || [];
      this.logger.info(`Initialized with ${enabledModules.length} enabled modules`);
      
      // Log module names
      if (enabledModules.length > 0) {
        const moduleNames = enabledModules.map(m => m.name).join(', ');
        this.logger.info(`Enabled modules: ${moduleNames}`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize module manager: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Execute all enabled modules on a certificate
   * @param {Object} certificate - The certificate data
   * @returns {Promise<Object>} - Module execution results
   */
  async execute(certificate) {
    if (!certificate) {
      throw new Error('Certificate data is required');
    }
    
    const enabledModules = this.loader.getEnabledModules();
    if (enabledModules.length === 0) {
      this.logger.debug('No enabled modules, skipping execution');
      return {};
    }
    
    this.logger.debug(`Executing ${enabledModules.length} modules on certificate`);
    
    // Prepare context for execution (will hold results from modules)
    const context = {
      results: {},
      startTime: Date.now()
    };
    
    // Run each module
    for (const module of enabledModules) {
      await this.executeModule(module, certificate, context);
    }
    
    // Add execution metadata
    context.executionTime = Date.now() - context.startTime;
    
    this.logger.debug(`Completed module execution in ${context.executionTime}ms`);
    return context.results;
  }
  
  /**
   * Execute a single module on a certificate
   * @param {Object} module - Module object with name and instance
   * @param {Object} certificate - Certificate data
   * @param {Object} context - Execution context
   * @returns {Promise<void>}
   * @private
   */
  async executeModule(module, certificate, context) {
    const { name, instance } = module;
    const start = Date.now();
    
    try {
      // Get cache key for this module and certificate
      const cacheKey = instance.getCacheKey(certificate);
      
      // Check if result is in cache
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug(`Using cached result for module ${name}`);
        context.results[name] = {
          ...cached,
          fromCache: true
        };
        return;
      }
      
      // Execute the module
      this.logger.debug(`Executing module ${name}`);
      const result = await instance.process(certificate, context);
      
      // Store result in context
      context.results[name] = {
        ...result,
        executionTime: Date.now() - start
      };
      
      // Cache the result
      const ttl = instance.getCacheTTL(certificate);
      await this.cache.set(cacheKey, result, ttl);
      
      this.logger.debug(`Module ${name} executed in ${Date.now() - start}ms (cache TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Error executing module ${name}: ${error.message}`);
      
      // Store error in context
      context.results[name] = {
        error: error.message,
        executionTime: Date.now() - start
      };
    }
  }
  
  /**
   * Process module results and execute actions
   * @param {Object} results - Module execution results
   * @returns {Promise<void>}
   */
  async processResults(results) {
    // TODO: Implement action handlers based on module results
    // This is a placeholder for future expansion
    return;
  }
  
  /**
   * Get stats about modules and cache
   * @returns {Object} - Stats object
   */
  getStats() {
    return {
      modules: {
        total: this.modules.length,
        enabled: this.loader.getEnabledModules().length
      },
      cache: this.cache.getStats()
    };
  }
  
  /**
   * Destroy the module manager and clean up resources
   */
  destroy() {
    // Only destroy the cache if we created it internally
    if (this.cache && !this._externalCache) {
      this.cache.shutdown();
    }
  }
}

module.exports = ModuleManager;