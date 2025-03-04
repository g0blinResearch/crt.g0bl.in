/**
 * Text formatter for certificate data
 * Provides a human-readable, colorized output format for the terminal
 */
const chalk = require('chalk');

/**
 * Text formatter for certificate data
 */
class TextFormatter {
  /**
   * Create a new text formatter
   * @param {Object} options - Formatter options
   */
  constructor(options = {}) {
    this.colorize = options.colorize ?? true;
  }

  /**
   * Format certificate data as human-readable text
   * @param {Object} data - The certificate data to format
   * @param {boolean} colorized - Whether to colorize the output (overrides constructor setting)
   * @returns {string} The formatted text
   */
  format(data, colorized) {
    const useColor = colorized !== undefined ? colorized : this.colorize;
    
    try {
      if (!data || !data.certificate) {
        return useColor 
          ? chalk.red('Invalid certificate data')
          : 'Invalid certificate data';
      }

      const lines = [];
      
      // Add timestamp
      const timestamp = useColor 
        ? chalk.gray(data.timestamp)
        : data.timestamp;
      lines.push(`[${timestamp}] Certificate:`);
      
      // Add common name
      const cn = data.certificate.subject?.common_name || 'Unknown';
      const commonName = useColor 
        ? chalk.green(cn)
        : cn;
      lines.push(`  Common Name: ${commonName}`);
      
      // Add organization if available
      if (data.certificate.subject?.organization) {
        const org = useColor 
          ? chalk.blue(data.certificate.subject.organization)
          : data.certificate.subject.organization;
        lines.push(`  Organization: ${org}`);
      }
      
      // Add issuer
      const issuer = data.certificate.issuer?.common_name || 'Unknown';
      const issuerName = useColor 
        ? chalk.yellow(issuer)
        : issuer;
      lines.push(`  Issuer: ${issuerName}`);
      
      // Add validity period - convert epoch timestamps to ISO-8601
      let notBefore = data.certificate.validity?.not_before || 'Unknown';
      let notAfter = data.certificate.validity?.not_after || 'Unknown';
      
      // Convert epoch timestamps to ISO-8601 format if they're numbers
      if (typeof notBefore === 'number') {
        notBefore = new Date(notBefore * 1000).toISOString();
      }
      
      if (typeof notAfter === 'number') {
        notAfter = new Date(notAfter * 1000).toISOString();
      }
      
      lines.push(`  Valid: ${notBefore} → ${notAfter}`);
      
      // Add serial number if available
      if (data.certificate.serial_number) {
        lines.push(`  Serial: ${data.certificate.serial_number}`);
      }
      
      // Add CT logs
      if (data.ct_logs && data.ct_logs.length > 0) {
        const logName = useColor 
          ? chalk.cyan(data.ct_logs[0].log_name)
          : data.ct_logs[0].log_name;
        lines.push(`  Log: ${logName}`);
      }
      
      // Add domains
      if (data.domains && data.domains.length > 0) {
        lines.push(`  Domains:`);
        data.domains.forEach(domain => {
          const formattedDomain = useColor 
            ? chalk.cyan(domain)
            : domain;
          lines.push(`    - ${formattedDomain}`);
        });
      }
      
      return lines.join('\n');
    } catch (error) {
      return useColor 
        ? chalk.red(`Error formatting certificate: ${error.message}`)
        : `Error formatting certificate: ${error.message}`;
    }
  }

  /**
   * Format certificate data as text - alias for format() to maintain API compatibility
   * @param {Object} data - The certificate data to format
   * @param {boolean} colorized - Whether to colorize the output
   * @returns {string} The formatted text
   */
  formatCertificate(data, colorized) {
    return this.format(data, colorized);
  }

  /**
   * Format an error as text
   * @param {Error} error - The error to format
   * @param {boolean} colorized - Whether to colorize the output
   * @returns {string} The formatted text
   */
  formatError(error, colorized) {
    const useColor = colorized !== undefined ? colorized : this.colorize;
    
    const timestamp = new Date().toISOString();
    const formattedTimestamp = useColor 
      ? chalk.gray(timestamp)
      : timestamp;
    
    const errorMessage = useColor 
      ? chalk.red(error.message)
      : error.message;
    
    return `[${formattedTimestamp}] ERROR: ${errorMessage}`;
  }
}

// Export a singleton instance
module.exports = new TextFormatter();