/**
 * Domain Extractor Module
 * 
 * This module extracts domain names from certificates and maintains
 * a collection of unique domains.
 * 
 * @module modules/domain-extractor
 */

const fs = require('fs').promises;
const path = require('path');
const CertificateModule = require('../src/lib/certificate-module');
const { CacheUtils } = require('../src/lib/cache');

/**
 * Domain Extractor Module
 * 
 * Extracts and tracks domain names from certificates.
 * 
 * @extends CertificateModule
 */
class DomainExtractor extends CertificateModule {
  /**
   * Create a new domain extractor
   * @param {Object} options - Module options
   * @param {number} options.maxDomains - Maximum number of domains to track
   * @param {boolean} options.trackWildcards - Whether to track wildcard domains
   * @param {boolean} options.normalizeNames - Whether to normalize domain names
   * @param {Object} logger - Logger instance
   */
  constructor(options = {}, logger = console) {
    super({
      ...options,
      enabled: true,
      trackStats: true
    }, logger);
    
    // Set module-specific options with defaults
    this.options = {
      ...this.options,
      maxDomains: 100000,
      trackWildcards: false,
      normalizeNames: true
    };
    
    // Initialize domain collections
    this.domains = new Map();
    this.wildcardDomains = new Map();
    
    // Initialize module-specific stats
    this.stats = {
      ...this.stats,
      domains: {
        total: 0,
        unique: 0,
        wildcard: 0,
        maxDomains: this.options.maxDomains
      },
      certificates: {
        processed: 0,
        domainsExtracted: 0
      }
    };
  }
  
  /**
   * Process a certificate
   * @param {Object} certificate - Certificate object
   * @returns {Promise<Object|null>} Promise that resolves to processing result
   */
  async _processImpl(certificate) {
    try {
      // Update certificate stats
      this.stats.certificates.processed++;
      
      // Extract domains
      const domains = CacheUtils.extractDomains(certificate) || [];
      
      if (!domains || domains.length === 0) {
        return null;
      }
      
      // Track domains
      let uniqueDomainsAdded = 0;
      let wildcardDomainsAdded = 0;
      const newDomains = [];
      const newWildcards = [];
      
      for (const domain of domains) {
        // Skip empty domains
        if (!domain) {
          continue;
        }
        
        // Check if domain is a wildcard
        const isWildcard = CacheUtils.isWildcardDomain(domain);
        
        // Skip wildcards if not tracking them
        if (isWildcard && !this.options.trackWildcards) {
          continue;
        }
        
        // Normalize domain name if enabled
        const normalizedDomain = this.options.normalizeNames
          ? CacheUtils.normalizeDomain(domain)
          : domain;
        
        // Skip invalid domains
        if (!normalizedDomain) {
          continue;
        }
        
        // Add to appropriate collection
        if (isWildcard) {
          // Skip if we've reached the maximum domains
          if (this.wildcardDomains.size >= this.options.maxDomains) {
            this.logger.debug('Maximum wildcard domains reached, skipping');
            break;
          }
          
          // Skip if domain already exists
          if (this.wildcardDomains.has(normalizedDomain)) {
            // Update seen count if the domain exists
            const domainInfo = this.wildcardDomains.get(normalizedDomain);
            domainInfo.seenCount++;
            this.wildcardDomains.set(normalizedDomain, domainInfo);
            continue;
          }
          
          // Add domain
          this.wildcardDomains.set(normalizedDomain, {
            domain: normalizedDomain,
            firstSeen: new Date().toISOString(),
            seenCount: 1,
            isWildcard: true
          });
          
          newWildcards.push(normalizedDomain);
          wildcardDomainsAdded++;
          
        } else {
          // Skip if we've reached the maximum domains
          if (this.domains.size >= this.options.maxDomains) {
            this.logger.debug('Maximum domains reached, skipping');
            break;
          }
          
          // Skip if domain already exists
          if (this.domains.has(normalizedDomain)) {
            // Update seen count if the domain exists
            const domainInfo = this.domains.get(normalizedDomain);
            domainInfo.seenCount++;
            this.domains.set(normalizedDomain, domainInfo);
            continue;
          }
          
          // Add domain
          this.domains.set(normalizedDomain, {
            domain: normalizedDomain,
            firstSeen: new Date().toISOString(),
            seenCount: 1,
            isWildcard: false
          });
          
          newDomains.push(normalizedDomain);
          uniqueDomainsAdded++;
        }
      }
      
      // Update domain stats
      this.stats.domains.unique = this.domains.size;
      this.stats.domains.wildcard = this.wildcardDomains.size;
      this.stats.domains.total = this.domains.size + this.wildcardDomains.size;
      this.stats.certificates.domainsExtracted += domains.length;
      
      // Return processing result
      const certificateName = (() => {
        // Extract certificate name from various formats
        if (certificate.data?.leaf_cert?.subject?.CN) {
          return certificate.data.leaf_cert.subject.CN;
        } else if (certificate.certificate?.subject?.common_name) {
          return certificate.certificate.subject.common_name;
        }
        return "Unknown Certificate";
      })();
      
      // Return processing result with expected properties for test scripts
      return {
        certificateName,
        domainsProcessed: domains.length,
        newDomains,
        newWildcards,
        uniqueDomainsAdded,
        wildcardDomainsAdded
,
        success: true
      };
    } catch (error) {
      this.logger.error(`Error extracting domains: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Check if a domain exists
   * @param {string} domain - Domain to check
   * @param {boolean} includeWildcards - Whether to check wildcard domains
   * @returns {boolean} Whether the domain exists
   */
  hasDomain(domain, includeWildcards = true) {
    if (!domain) {
      return false;
    }
    
    // Normalize domain name if enabled
    const normalizedDomain = this.options.normalizeNames
      ? CacheUtils.normalizeDomain(domain)
      : domain;
    
    // Skip invalid domains
    if (!normalizedDomain) {
      return false;
    }
    
    // Check regular domains
    if (this.domains.has(normalizedDomain)) {
      return true;
    }
    
    // Check wildcard domains if enabled
    if (includeWildcards && this.options.trackWildcards) {
      // Check if domain is a wildcard
      const isWildcard = CacheUtils.isWildcardDomain(normalizedDomain);
      
      if (isWildcard) {
        return this.wildcardDomains.has(normalizedDomain);
      }
      
      // Check if domain matches any wildcard
      for (const wildcardDomain of this.wildcardDomains.keys()) {
        // Remove wildcard and check if domain ends with remainder
        const wildcardBase = wildcardDomain.substring(1); // Remove *
        
        if (normalizedDomain.endsWith(wildcardBase)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get domain information
   * @param {string} domain - Domain to get information for
   * @returns {Object|null} Domain information or null if not found
   */
  getDomainInfo(domain) {
    if (!domain) {
      return null;
    }
    
    // Normalize domain name if enabled
    const normalizedDomain = this.options.normalizeNames
      ? CacheUtils.normalizeDomain(domain)
      : domain;
    
    // Skip invalid domains
    if (!normalizedDomain) {
      return null;
    }
    
    // Check if domain exists
    if (this.domains.has(normalizedDomain)) {
      return this.domains.get(normalizedDomain);
    }
    
    // Check wildcard domains if enabled
    if (this.options.trackWildcards) {
      // Check if domain is a wildcard
      const isWildcard = CacheUtils.isWildcardDomain(normalizedDomain);
      
      if (isWildcard && this.wildcardDomains.has(normalizedDomain)) {
        return this.wildcardDomains.get(normalizedDomain);
      }
    }
    
    return null;
  }
  
  /**
   * Check if a domain exists in the wildcard domains collection
   * @param {string} domain - Domain to check
   * @returns {boolean} Whether the domain exists as a wildcard or matches a wildcard
   */
  hasWildcardDomain(domain) {
    if (!domain || !this.options.trackWildcards) {
      return false;
    }
    
    // Normalize domain name if enabled
    const normalizedDomain = this.options.normalizeNames
      ? CacheUtils.normalizeDomain(domain)
      : domain;
    
    // Skip invalid domains
    if (!normalizedDomain) {
      return false;
    }
    
    // Check if domain is a wildcard and exists directly
    const isWildcard = CacheUtils.isWildcardDomain(normalizedDomain);
    
    if (isWildcard) {
      return this.wildcardDomains.has(normalizedDomain);
    }
    
    // Check if domain matches any wildcard patterns
    for (const wildcardDomain of this.wildcardDomains.keys()) {
      // Remove wildcard prefix and check if domain ends with remainder
      const wildcardBase = wildcardDomain.substring(2); // Remove *. or *-
      
      if (normalizedDomain.endsWith(wildcardBase)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Find domains matching a pattern
   * @param {string} pattern - Pattern to search for
   * @param {Object} options - Search options
   * @param {number} options.limit - Maximum number of results to return
   * @param {boolean} options.includeWildcards - Whether to include wildcard domains
   * @returns {Array<string>} Matching domains
   */
  findDomains(pattern, options = {}) {
    try {
      if (!pattern) {
        return [];
      }
      
      // Set options with defaults
      const searchOptions = {
        limit: 100,
        includeWildcards: this.options.trackWildcards,
        ...options
      };
      
      // Create regex from pattern
      const regex = new RegExp(pattern, 'i');
      const results = [];
      
      // Search regular domains
      for (const domain of this.domains.keys()) {
        if (regex.test(domain)) {
          results.push(domain);
          
          // Check limit
          if (results.length >= searchOptions.limit) {
            return results;
          }
        }
      }
      
      // Search wildcard domains if enabled
      if (searchOptions.includeWildcards && this.options.trackWildcards) {
        for (const domain of this.wildcardDomains.keys()) {
          if (regex.test(domain)) {
            results.push(domain);
            
            // Check limit
            if (results.length >= searchOptions.limit) {
              return results;
            }
          }
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Error finding domains: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Save domains to a file
   * @param {string} filePath - File path to save domains to
   * @param {Object} options - Save options
   * @param {string} options.format - Output format (json or text)
   * @param {boolean} options.includeWildcards - Whether to include wildcard domains
   * @param {boolean} options.includeMetadata - Whether to include domain metadata
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async saveDomains(filePath, options = {}) {
    try {
      // Set options with defaults
      const saveOptions = {
        format: 'json',
        includeWildcards: true,
        includeMetadata: true,
        ...options
      };
      
      // Create output directory if it doesn't exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Prepare domains
      let domainsData;
      
      if (saveOptions.format === 'json') {
        // JSON format
        if (saveOptions.includeMetadata) {
          // Include metadata
          domainsData = {
            metadata: {
              timestamp: new Date().toISOString(),
              domainCount: this.domains.size,
              wildcardDomainCount: saveOptions.includeWildcards ? this.wildcardDomains.size : 0,
              totalDomainCount: this.domains.size + (saveOptions.includeWildcards ? this.wildcardDomains.size : 0)
            },
            domains: Array.from(this.domains.values()),
            wildcardDomains: saveOptions.includeWildcards
              ? Array.from(this.wildcardDomains.values())
              : []
          };
        } else {
          // Just domain names
          domainsData = {
            domains: Array.from(this.domains.keys()),
            wildcardDomains: saveOptions.includeWildcards
              ? Array.from(this.wildcardDomains.keys())
              : []
          };
        }
        
        // Write JSON
        await fs.writeFile(filePath, JSON.stringify(domainsData, null, 2));
      } else {
        // Text format (one domain per line)
        const domainsList = Array.from(this.domains.keys());
        
        if (saveOptions.includeWildcards) {
          domainsList.push(...Array.from(this.wildcardDomains.keys()));
        }
        
        // Sort domains
        domainsList.sort();
        
        // Write text
        await fs.writeFile(filePath, domainsList.join('\n'));
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error saving domains: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Clear all domains
   */
  clearDomains() {
    this.domains.clear();
    this.wildcardDomains.clear();
    
    // Update stats
    this.stats.domains.unique = 0;
    this.stats.domains.wildcard = 0;
    this.stats.domains.total = 0;
  }
  
  /**
   * Get module statistics
   * @returns {Object} Module statistics
   */
  getStats() {
    // Get base stats
    const baseStats = super.getStats();
    
    // Map stats to expected format for test script
    const testStats = {
      certificatesProcessed: this.stats.certificates.processed,
      domainsProcessed: this.stats.certificates.domainsExtracted,
      uniqueDomainsFound: this.stats.domains.unique,
      wildcardDomainsFound: this.stats.domains.wildcard
    };
    
    // Add domain-specific stats
    return {
      ...baseStats,
      domains: this.stats.domains,
      certificates: this.stats.certificates,
      ...testStats
    };
  }
  
  /**
   * Clean up resources
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async destroy() {
    try {
      this.logger.debug('Cleaning up domain extractor resources');
      
      // Call parent destroy if it exists
      if (super.destroy) {
        await super.destroy();
      }
      
      // Clear collections
      this.domains.clear();
      this.wildcardDomains.clear();
      
      // Reset stats
      this.stats.domains.unique = 0;
      this.stats.domains.wildcard = 0;
      this.stats.domains.total = 0;
      
      return true;
    } catch (error) {
      this.logger.error(`Error destroying domain extractor: ${error.message}`);
      return false;
    }
  }
}

module.exports = DomainExtractor;