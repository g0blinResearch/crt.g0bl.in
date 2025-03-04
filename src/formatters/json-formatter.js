/**
 * JSON formatter for certificate data
 */

/**
 * JSON formatter for certificate data
 */
class JsonFormatter {
  /**
   * Create a new JSON formatter
   * @param {Object} options - Formatter options
   */
  constructor(options = {}) {
    this.pretty = options.pretty ?? true; // Default to pretty output
  }

  /**
   * Format certificate data as JSON
   * @param {Object} data - The certificate data to format
   * @param {boolean} pretty - Whether to pretty-print the output
   * @returns {string} The formatted JSON string
   */
  format(data, pretty) {
    const usePretty = pretty !== undefined ? pretty : this.pretty;
    return usePretty 
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
  }

  /**
   * Format certificate data as JSON - alias for format() to maintain API compatibility
   * @param {Object} data - The certificate data to format
   * @param {boolean} pretty - Whether to pretty-print the output
   * @returns {string} The formatted JSON string
   */
  formatCertificate(data, pretty) {
    return this.format(data, pretty);
  }

  /**
   * Format an error as JSON
   * @param {Error} error - The error to format
   * @param {boolean} pretty - Whether to pretty-print the output
   * @returns {string} The formatted JSON string
   */
  formatError(error, pretty) {
    const usePretty = pretty !== undefined ? pretty : this.pretty;
    
    const errorData = {
      error: {
        message: error.message,
        name: error.name,
        stack: usePretty ? error.stack : undefined
      },
      timestamp: new Date().toISOString()
    };

    return usePretty 
      ? JSON.stringify(errorData, null, 2)
      : JSON.stringify(errorData);
  }
}

// Export a singleton instance
module.exports = new JsonFormatter();