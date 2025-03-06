/**
 * Module Loader
 * 
 * Dynamically loads certificate processing modules from the specified directory.
 */
const fs = require('fs');
const path = require('path');

/**
 * Dynamically loads modules from the specified directory
 */
class ModuleLoader {
  /**
   * Constructor
   * @param {Object} config - Loader configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.modulesDir = config.modulesDir || './modules';
    this.moduleConfigs = config.moduleConfigs || {};
    this.logger = logger;
    this.modules = [];
  }
  
  /**
   * Load all modules from the configured directory
   * @returns {Array} - Loaded module instances
   */
  async loadModules() {
    try {
      this.logger.debug(`Loading modules from ${this.modulesDir}`);
      
      // Ensure modules directory exists
      if (!fs.existsSync(this.modulesDir)) {
        this.logger.info(`Modules directory ${this.modulesDir} not found. Creating it...`);
        fs.mkdirSync(this.modulesDir, { recursive: true });
      }
      
      // Read modules directory
      const files = await fs.promises.readdir(this.modulesDir);
      
      // Filter for JavaScript files
      const jsFiles = files.filter(file => file.endsWith('.js'));
      
      if (jsFiles.length === 0) {
        this.logger.info(`No module files found in ${this.modulesDir}`);
      } else {
        this.logger.debug(`Found ${jsFiles.length} module files: ${jsFiles.join(', ')}`);
      }
      
      // Load each module
      for (const file of jsFiles) {
        await this.loadModule(file);
      }
      
      this.logger.info(`Successfully loaded ${this.modules.length} modules`);
      return this.modules;
    } catch (error) {
      this.logger.error(`Failed to load modules: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Load a specific module
   * @param {String} fileName - Module file name
   */
  async loadModule(fileName) {
    try {
      const modulePath = path.join(this.modulesDir, fileName);
      
      // Get module name from file name
      const moduleName = path.basename(fileName, '.js');
      
      // Get module configuration
      const moduleConfig = this.moduleConfigs[moduleName] || {};
      
      // Calculate the absolute path to resolve correctly
      const absoluteModulePath = path.resolve(modulePath);
      
      this.logger.debug(`Loading module from ${absoluteModulePath}`);
      
      // Dynamic import
      let ModuleClass;
      try {
        // First try to require the module directly
        ModuleClass = require(absoluteModulePath);
      } catch (importError) {
        this.logger.error(`Error importing module ${moduleName}: ${importError.message}`);
        return;
      }
      
      // Handle modules that export as default or as module.exports
      if (ModuleClass.default) {
        ModuleClass = ModuleClass.default;
      }
      
      // Validate the module
      if (typeof ModuleClass !== 'function') {
        this.logger.error(`Module ${moduleName} does not export a class`);
        return;
      }
      
      // Instantiate and add to modules list
      try {
        const moduleInstance = new ModuleClass(moduleConfig);
        
        // Validate that required methods are implemented
        if (typeof moduleInstance.process !== 'function') {
          this.logger.error(`Module ${moduleName} does not implement the required process method`);
          return;
        }
        
        // Add to modules list
        this.modules.push({
          name: moduleName,
          instance: moduleInstance,
          enabled: moduleConfig.enabled !== false // Default to enabled if not specified
        });
        
        this.logger.info(`Loaded module: ${moduleName}`);
      } catch (instantiationError) {
        this.logger.error(`Error instantiating module ${moduleName}: ${instantiationError.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load module ${fileName}: ${error.message}`);
    }
  }
  
  /**
   * Get a list of loaded modules
   * @returns {Array} - Array of module objects
   */
  getModules() {
    return this.modules;
  }
  
  /**
   * Get enabled modules only
   * @returns {Array} - Array of enabled module objects
   */
  getEnabledModules() {
    return this.modules.filter(m => m.enabled);
  }
}

module.exports = ModuleLoader;