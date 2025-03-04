/**
 * Logger module for Certificate Transparency Stream Subscriber
 */
const chalk = require('chalk');

// Log levels and their numeric values
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Format timestamp for log messages
 * @returns {string} Formatted timestamp
 */
const timestamp = () => {
  return new Date().toISOString();
};

/**
 * Create a new logger instance
 * @param {Object} config - Configuration object
 * @returns {Object} Logger instance
 */
function createLogger(config) {
  if (!config) {
    throw new Error('Logger requires a config object');
  }
  
  /**
   * Get the current log level from config
   * @returns {number} The numeric log level
   */
  const getLogLevel = () => {
    const configLevel = (config.logLevel || 'info').toLowerCase();
    const level = LOG_LEVELS[configLevel];
    return level !== undefined ? level : LOG_LEVELS.info;
  };
  
  /**
   * Check if a message at the given level should be logged
   * @param {number} messageLevel - The numeric level of the message
   * @returns {boolean} True if the message should be logged
   */
  const shouldLog = (messageLevel) => {
    // FIX: The correct comparison for log levels
    // We want to log messages with level >= configured level
    return messageLevel >= getLogLevel();
  };
  
  /**
   * Check if we're in quiet mode (suppress all output except certificate data)
   * @returns {boolean} True if we're in quiet mode
   */
  const isQuietMode = () => {
    return config.quiet === true;
  };
  
  return {
    /**
     * Log a debug message
     * @param {...any} args - Message and arguments to log
     */
    debug(...args) {
      // Skip all messages in quiet mode
      if (isQuietMode()) return;
      
      // Only log if the current log level includes debug
      if (getLogLevel() <= LOG_LEVELS.debug) {
        const message = `[${timestamp()}] [DEBUG] ${args.join(' ')}`;
        console.log(chalk.gray(message));
      }
    },

    /**
     * Log an info message
     * @param {...any} args - Message and arguments to log
     */
    info(...args) {
      // Skip all messages in quiet mode
      if (isQuietMode()) return;
      
      if (getLogLevel() <= LOG_LEVELS.info) {
        const message = `[${timestamp()}] [INFO] ${args.join(' ')}`;
        console.log(chalk.blue(message));
      }
    },

    /**
     * Log a warning message
     * @param {...any} args - Message and arguments to log
     */
    warn(...args) {
      // Skip all messages in quiet mode
      if (isQuietMode()) return;
      
      if (getLogLevel() <= LOG_LEVELS.warn) {
        const message = `[${timestamp()}] [WARN] ${args.join(' ')}`;
        console.log(chalk.yellow(message));
      }
    },

    /**
     * Log an error message
     * @param {...any} args - Message and arguments to log
     */
    error(...args) {
      // Skip all messages in quiet mode
      if (isQuietMode()) return;
      
      if (getLogLevel() <= LOG_LEVELS.error) {
        const message = `[${timestamp()}] [ERROR] ${args.join(' ')}`;
        console.error(chalk.red(message));
      }
    },

    /**
     * Log a success message (always shown unless log level is higher than info)
     * @param {...any} args - Message and arguments to log
     */
    success(...args) {
      // Skip all messages in quiet mode
      if (isQuietMode()) return;
      
      if (getLogLevel() <= LOG_LEVELS.info) {
        const message = `[${timestamp()}] [SUCCESS] ${args.join(' ')}`;
        console.log(chalk.green(message));
      }
    },

    /**
     * Log certificate data
     * Only displayed when:
     * 1. In quiet mode (where it's the only output)
     * 2. When log level is 'debug'
     * @param {string} formattedData - The formatted certificate data
     */
    certificate(formattedData) {
      // Output certificate data only in quiet mode OR when in debug log level
      if (isQuietMode() || getLogLevel() <= LOG_LEVELS.debug) {
        console.log(formattedData);
      }
    },

    /**
     * Log JSON data
     * @param {object} data - The data to log
     * @param {boolean} pretty - Whether to prettify the output
     */
    json(data, pretty = true) {
      // Skip all messages in quiet mode
      if (isQuietMode()) return;
      
      if (getLogLevel() <= LOG_LEVELS.debug) {
        const output = pretty 
          ? JSON.stringify(data, null, 2)
          : JSON.stringify(data);
        console.log(output);
      }
    },

    /**
     * Get the current log level name
     * @returns {string} The log level name
     */
    getCurrentLevel() {
      const level = getLogLevel();
      return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'info';
    }
  };
}

module.exports = {
  createLogger,
  LOG_LEVELS
};