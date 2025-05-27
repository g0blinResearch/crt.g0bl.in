/**
 * Certificate Transparency Cache
 * 
 * Provides a unified caching system for certificates and domains.
 * 
 * @module lib/cache
 */

/**
 * Cache Utilities
 * 
 * Utility functions for certificate caching and processing.
 */
class CacheUtils {
  /**
   * Generate a cache key for a certificate
   * @param {Object} certificate - Certificate object
   * @returns {string|null} Cache key or null if invalid
   */
  static generateCacheKey(certificate) {
    try {
      // Handle new certificate format
      if (certificate && certificate.certificate) {
        // New format has certificate.certificate structure
        const certData = certificate.certificate;
        
        // Use fingerprint if available (formatted as SHA256 in new format)
        if (certData.fingerprint && certData.fingerprint.sha256) {
          return `cert:${certData.fingerprint.sha256.replace(/:/g, '')}`;
        }
        
        // Use serial number and subject
        if (certData.serial_number && certData.subject && certData.subject.common_name) {
  
        return `cert:${certData.serial_number}:${certData.subject.common_name}`;
        }
        
        // Use serial number and issuer as fallback
        if (certData.serial_number && certData.issuer && certData.issuer.common_name) {
          return `cert:${certData.serial_number}:${certData.issuer.common_name}`;
        }
      
  
        // Last resort: use domains if available
        if (certificate.domains && certificate.domains.length > 0) {
          const domain = certificate.domains[0];
          return `cert:domain:${domain}`;
        }
        
        return null;
      }
      
      // Handle legacy certificate format (Google CT format)
      if (certificate && certificate.data && certificate.data.leaf_cert) {
        const leafCert = certificate.data.leaf_cert;
      
        // Use cert_index as primary unique identifier for Google CT
        if (certificate.data.cert_index !== undefined && certificate.data.cert_index !== null) {
          return `cert:index:${certificate.data.cert_index}`;
        }
  
        // Use fingerprint if available
        if (leafCert.fingerprint) {
          return `cert:${leafCert.fingerprint}`;
        }
        
        // Use serial number and subject
        if (leafCert.serial_number && leafCert.subject && leafCert.subject.CN) {
          return `cert:${leafCert.serial_number}:${leafCert.subject.CN}`;
       }
      
  
        // Use serial number and issuer as fallback
        if (leafCert.serial_number && leafCert.issuer && leafCert.issuer.CN) {
          return `cert:${leafCert.serial_number}:${leafCert.issuer.CN}`;
        }
      
  
        // Last resort: use all_domains if available
        if (leafCert.all_domains && leafCert.all_domains.length > 0) {
          const domain = leafCert.all_domains[0];
          return `cert:domain:${domain}`;
        }
        
        return null;
      }
      
      // Additional fallback for any other format
      // This is a generic attempt to handle unknown formats
      if (certificate) {
        // Try to find a fingerprint or ID
        if (typeof certificate === 'object') {
          // Look for common certificate identifier fields
          if (certificate.fingerprint) return `cert:${certificate.fingerprint}`;
          if (certificate.serial) return `cert:${certificate.serial}`;
          if (certificate.id) return `cert:${certificate.id}`;
          
          // If we have a domain, use that as last resort
          if (certificate.domain) return `cert:domain:${certificate.domain}`;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error generating cache key: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Extract domains from a certificate
   * @param {Object} certificate - Certificate object
   * @returns {Array<string>|null} Array of domains or null if invalid
   */
  static extractDomains(certificate) {
    try {
      // Handle new certificate format
      if (certificate && certificate.domains && Array.isArray(certificate.domains)) {
        // New format has domains at the top level
        return [...certificate.domains];
      }
      
      // Handle legacy certificate format
      if (certificate && certificate.data && certificate.data.leaf_cert) {
        const leafCert = certificate.data.leaf_cert;
      
  
        // Use all_domains if available
        if (leafCert.all_domains && Array.isArray(leafCert.all_domains)) {
          return [...leafCert.all_domains];
        }
      
  
        // Otherwise, build list from extensions and subject
        const domains = [];
      
  
        // Add subject CN if available
        if (leafCert.subject && leafCert.subject.CN) {
          domains.push(leafCert.subject.CN);
       } 
      
  
        // Add SAN domains if available
        if (leafCert.extensions && leafCert.extensions.subjectAltName) {
          try {
            const san = leafCert.extensions.subjectAltName;
            let dnsNames = [];
            
            if (typeof san === 'string') {
              // Handle string format (comma-separated)
              dnsNames = san.split(',')
                .map(part => part.trim())
                .filter(part => part.startsWith('DNS:'))
                .map(part => part.replace('DNS:', ''));
            } else if (Array.isArray(san)) {
              // Handle array format
              dnsNames = san
                .filter(item => typeof item === 'string' && item.startsWith('DNS:'))
                .map(item => item.replace('DNS:', ''));
            } else if (san && typeof san === 'object') {
              // Handle object format - extract DNS entries
              if (san.dns && Array.isArray(san.dns)) {
                dnsNames = san.dns;
              } else if (san.dNSName && Array.isArray(san.dNSName)) {
                dnsNames = san.dNSName;
              }
            }
            
            // Add to domains
            domains.push(...dnsNames);
          } catch (error) {
            // Log the error but don't crash
            console.error('Error extracting domains:', error.message);
          }
       }
      
  
        // Deduplicate and return
        return [...new Set(domains)];
      }
      
      // Additional fallbacks for other formats
      if (certificate) {
        // Try to find domains in various formats
        if (certificate.subject && certificate.subject.common_name) {
          return [certificate.subject.common_name];
        }
        
        if (certificate.commonName) {
          return [certificate.commonName];
        }
        
        if (certificate.cn) {
          return [certificate.cn];
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error extracting domains: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Extract domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string|null} Domain or null if invalid
   */
  static extractDomainFromUrl(url) {
    try {
      if (!url) {
        return null;
      }
      
      // Make sure URL starts with a protocol
      let urlWithProtocol = url;
      
      if (!url.match(/^[a-zA-Z]+:\/\//)) {
        urlWithProtocol = `http://${url}`;
      }
      
      // Parse URL
      const urlObj = new URL(urlWithProtocol);
      
      // Return hostname
      return urlObj.hostname || null;
    } catch (error) {
      // Not a valid URL
      return null;
    }
  }
  
  /**
   * Check if a domain is a wildcard domain
   * @param {string} domain - Domain to check
   * @returns {boolean} Whether the domain is a wildcard
   */
  static isWildcardDomain(domain) {
    if (!domain) {
      return false;
    }
    
    return domain.startsWith('*.') || domain.startsWith('*-');
  }
  
  /**
   * Normalize a domain name
   * @param {string} domain - Domain to normalize
   * @returns {string|null} Normalized domain or null if invalid
   */
  static normalizeDomain(domain) {
    try {
      if (!domain) {
        return null;
      }
      
      // Convert to lowercase
      let normalized = domain.toLowerCase();
      
      // Remove trailing dot
      if (normalized.endsWith('.')) {
        normalized = normalized.slice(0, -1);
      }
      
      // Validate domain format
      if (!CacheUtils.isValidDomain(normalized)) {
        return null;
      }
      
      return normalized;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Check if a domain is valid
   * @param {string} domain - Domain to validate
   * @returns {boolean} Whether the domain is valid
   */
  static isValidDomain(domain) {
    if (!domain) {
      return false;
    }
    
    // Check if domain is a wildcard
    if (CacheUtils.isWildcardDomain(domain)) {
      // Validate the part after the wildcard
      const domainPart = domain.substring(2);
      return CacheUtils.isValidDomain(domainPart);
    }
    
    // Regular expression for domain validation
    // This allows IDNs (internationalized domain names) in Punycode format (xn--)
    const domainRegex = /^((?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)|(?:xn--[a-z0-9-]+))\.)+[a-z]{2,}$/i;
    
    return domainRegex.test(domain);
  }
  
  /**
   * Filter domains by pattern
   * @param {Array<string>} domains - Array of domains to filter
   * @param {string} pattern - Pattern to filter by
   * @returns {Array<string>} Filtered domains
   */
  static filterDomainsByPattern(domains, pattern) {
    if (!domains || !Array.isArray(domains) || !pattern) {
      return [];
    }
    
    try {
      // Create regex from pattern
      const regex = new RegExp(pattern, 'i');
      
      // Filter domains
      return domains.filter(domain => regex.test(domain));
    } catch (error) {
      console.error(`Error filtering domains: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Extract certificate information
   * @param {Object} certificate - Certificate object
   * @returns {Object|null} Certificate information or null if invalid
   */
  static extractCertificateInfo(certificate) {
    try {
      if (!certificate || !certificate.data || !certificate.data.leaf_cert) {
        return null;
      }
      
      const leafCert = certificate.data.leaf_cert;
      
      // Extract basic information
      const info = {
        id: certificate.data.cert_index || null, // Use cert_index as unique identifier
        serialNumber: leafCert.serial_number || null,
        fingerprint: leafCert.fingerprint || null,
        validFrom: null,
        validTo: null,
        commonName: null,
        issuer: null,
        domains: CacheUtils.extractDomains(certificate) || []
      };
      
      // Extract validity dates
      if (leafCert.not_before) {
        info.validFrom = new Date(leafCert.not_before).toISOString();
      }
      
      if (leafCert.not_after) {
        info.validTo = new Date(leafCert.not_after).toISOString();
      }
      
      // Extract subject
      if (leafCert.subject && leafCert.subject.CN) {
        info.commonName = leafCert.subject.CN;
      }
      
      // Extract issuer
      if (leafCert.issuer && leafCert.issuer.CN) {
        info.issuer = leafCert.issuer.CN;
      }
      
      return info;
    } catch (error) {
      console.error(`Error extracting certificate info: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Format certificate seen timestamp
   * @param {Object} certificate - Certificate object
   * @returns {string|null} Formatted timestamp or null if invalid
   */
  static formatCertificateTimestamp(certificate) {
    try {
      if (!certificate || !certificate.data || !certificate.data.seen) {
        return null;
      }
      
      return new Date(certificate.data.seen * 1000).toISOString();
    } catch (error) {
      return null;
    }
  }
}

/**
 * LRU Cache implementation
 */
class LruCache {
  /**
   * Create a new LRU cache
   * @param {Object} options - Cache options
   * @param {number} options.maxSize - Maximum cache size
   * @param {number} options.ttl - Cache TTL in seconds
   * @param {string} name - Cache name for logging
   * @param {Object} logger - Logger instance
   */
  constructor(options, name, logger) {
    this.options = options;
    this.name = name;
    this.logger = logger;
    
    // Initialize cache
    this.cache = new Map();
    this.keyTimestamps = new Map();
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      expirations: 0,
      size: 0,
      maxSize: this.options.maxSize
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, 60000); // Cleanup every minute
  }
  
  /**
   * Get an item from the cache
   * @param {string} key - Cache key
   * @returns {any|null} Item or null if not found
   */
  get(key) {
    try {
      // Check if key exists
      if (!this.cache.has(key)) {
        this.stats.misses++;
        return null;
      }
      
      // Get item
      const item = this.cache.get(key);
      const timestamp = this.keyTimestamps.get(key);
      
      // Check if expired
      if (timestamp && this._isExpired(timestamp)) {
        // Remove expired item
        this.delete(key);
        this.stats.expirations++;
        this.stats.misses++;
        return null;
      }
      
      // Update timestamp (for LRU)
      this.keyTimestamps.set(key, Date.now());
      
      // Update stats
      this.stats.hits++;
      
      // Return item
      return item;
    } catch (error) {
      this.logger.error(`Error getting cache item from ${this.name}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Set an item in the cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @returns {boolean} Whether the item was cached
   */
  set(key, value) {
    try {
      // Check if we need to evict items
      if (this.cache.size >= this.options.maxSize) {
        this._evict();
      }
      
      // Set item
      this.cache.set(key, value);
      this.keyTimestamps.set(key, Date.now());
      
      // Update stats
      this.stats.sets++;
      this.stats.size = this.cache.size;
      
      return true;
    } catch (error) {
      this.logger.error(`Error setting cache item in ${this.name}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if an item exists in the cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether the item exists
   */
  has(key) {
    try {
      // Check if key exists
      if (!this.cache.has(key)) {
        return false;
      }
      
      // Check if expired
      const timestamp = this.keyTimestamps.get(key);
      
      if (timestamp && this._isExpired(timestamp)) {
        // Remove expired item
        this.delete(key);
        this.stats.expirations++;
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error checking cache item in ${this.name}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Delete an item from the cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether the item was deleted
   */
  delete(key) {
    try {
      // Check if key exists
      if (!this.cache.has(key)) {
        return false;
      }
      
      // Delete item
      this.cache.delete(key);
      this.keyTimestamps.delete(key);
      
      // Update stats
      this.stats.size = this.cache.size;
      
      return true;
    } catch (error) {
      this.logger.error(`Error deleting cache item in ${this.name}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Clear the cache
   * @returns {boolean} Whether the cache was cleared
   */
  clear() {
    try {
      // Clear cache
      this.cache.clear();
      this.keyTimestamps.clear();
      
      // Reset stats
      this.stats.size = 0;
      
      return true;
    } catch (error) {
      this.logger.error(`Error clearing ${this.name} cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const hitRatio = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0;
    
    return {
      ...this.stats,
      hitRatio: hitRatio.toFixed(2),
      usagePercent: ((this.stats.size / this.stats.maxSize) * 100).toFixed(2)
    };
  }
  
  /**
   * Get all keys in the cache
   * @returns {Array<string>} Array of cache keys
   */
  getKeys() {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get the number of items in the cache
   * @returns {number} Cache size
   */
  getSize() {
    return this.cache.size;
  }
  
  /**
   * Initialize the cache
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async initialize() {
    try {
      this.logger.debug(`Initializing ${this.name} cache`);
      return true;
    } catch (error) {
      this.logger.error(`Error initializing ${this.name} cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Shut down the cache
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async shutdown() {
    try {
      this.logger.debug(`Shutting down ${this.name} cache`);
      
      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error shutting down ${this.name} cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if an item is expired
   * @private
   * @param {number} timestamp - Item timestamp
   * @returns {boolean} Whether the item is expired
   */
  _isExpired(timestamp) {
    if (!timestamp) {
      return true;
    }
    
    const age = Date.now() - timestamp;
    return age > this.options.ttl * 1000;
  }
  
  /**
   * Evict least recently used items
   * @private
   */
  _evict() {
    try {
      // Get all entries with timestamps
      const entries = Array.from(this.keyTimestamps.entries());
      
      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a[1] - b[1]);
      
      // Calculate how many items to evict (10% of max size or at least 1)
      const evictCount = Math.max(1, Math.floor(this.options.maxSize * 0.1));
      
      // Evict items
      for (let i = 0; i < evictCount && i < entries.length; i++) {
        const [key] = entries[i];
        this.delete(key);
        this.stats.evictions++;
      }
    } catch (error) {
      this.logger.error(`Error evicting ${this.name} cache items: ${error.message}`);
    }
  }
  
  /**
   * Clean up expired items
   * @private
   */
  _cleanup() {
    try {
      // Check each item
      for (const [key, timestamp] of this.keyTimestamps.entries()) {
        if (this._isExpired(timestamp)) {
          this.delete(key);
          this.stats.expirations++;
        }
      }
    } catch (error) {
      this.logger.error(`Error cleaning up ${this.name} cache: ${error.message}`);
    }
  }
}

/**
 * Cache Manager
 * 
 * Provides a unified interface for certificate and domain caching.
 */
class CacheManager {
  /**
   * Create a new cache manager
   * @param {Object} options - Cache options
   * @param {Object} options.certificates - Certificate cache options
   * @param {Object} options.domains - Domain cache options
   * @param {Object} logger - Logger instance
   */
  constructor(options = {}, logger = console) {
    this.logger = logger;
    
    // Set options with defaults
    this.options = {
      certificates: {
        enabled: true,
        maxSize: 10000,
        ttl: 3600 // 1 hour
      },
      domains: {
        enabled: true,
        maxSize: 100000,
        ttl: 86400 // 24 hours
      },
      ...options
    };
    
    // If we got a simple defaultTTL option, use it for both caches
    if (options.defaultTTL && typeof options.defaultTTL === 'number') {
      this.options.certificates.ttl = options.defaultTTL;
      this.options.domains.ttl = options.defaultTTL;
    }
    
    this.caches = new Map();
    this.initialized = false;
    
    // Statistics
    this.stats = {
      lookups: 0,
      certHits: 0,
      certMisses: 0,
      domainHits: 0,
      domainMisses: 0
    };
    
    // Initialize immediately
    this.initialize();
  }
  
  /**
   * Initialize the cache manager
   * @returns {Promise<boolean>} Promise that resolves to true if initialized
   */
  async initialize() {
    try {
      this.logger.debug('Initializing cache manager');
      
      // Initialize certificate cache
      if (this.options.certificates.enabled) {
        const certCache = new LruCache(
          this.options.certificates,
          'certificates',
          this.logger
        );
        this.caches.set('certificates', certCache);
      }
      
      // Initialize domain cache
      if (this.options.domains.enabled) {
        const domainCache = new LruCache(
          this.options.domains,
          'domains',
          this.logger
        );
        this.caches.set('domains', domainCache);
      }
      
      // Initialize each cache
      const initPromises = [];
      
      for (const [name, cache] of this.caches.entries()) {
        if (typeof cache.initialize === 'function') {
          initPromises.push(
            cache.initialize().catch(error => {
              this.logger.error(`Error initializing cache '${name}': ${error.message}`);
              return false;
            })
          );
        }
      }
      
      // Wait for all caches to initialize
      const results = await Promise.all(initPromises);
      
      // Check if all caches were initialized successfully
      const success = results.every(result => result !== false);
      
      this.initialized = success;
      
      return success;
    } catch (error) {
      this.logger.error(`Error initializing cache manager: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Shut down the cache manager
   * @returns {Promise<boolean>} Promise that resolves to true if shut down
   */
  async shutdown() {
    try {
      this.logger.debug('Shutting down cache manager');
      
      // Shut down each cache
      const shutdownPromises = [];
      
      for (const [name, cache] of this.caches.entries()) {
        if (typeof cache.shutdown === 'function') {
          shutdownPromises.push(
            cache.shutdown().catch(error => {
              this.logger.error(`Error shutting down cache '${name}': ${error.message}`);
              return false;
            })
          );
        }
      }
      
      // Wait for all caches to shut down
      const results = await Promise.all(shutdownPromises);
      
      // Check if all caches were shut down successfully
      const success = results.every(result => result !== false);
      
      this.initialized = false;
      
      return success;
    } catch (error) {
      this.logger.error(`Error shutting down cache manager: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Register a cache
   * @param {string} name - Cache name
   * @param {Object} cache - Cache instance
   * @returns {boolean} Whether the cache was registered
   */
  registerCache(name, cache) {
    try {
      if (!name || !cache) {
        this.logger.error('Invalid cache registration');
        return false;
      }
      
      // Check if cache already exists
      if (this.caches.has(name)) {
        this.logger.warn(`Cache already registered: ${name}`);
        return false;
      }
      
      // Check if cache has required methods
      const requiredMethods = ['get', 'set', 'has', 'delete', 'clear'];
      
      for (const method of requiredMethods) {
        if (typeof cache[method] !== 'function') {
          this.logger.error(`Cache missing required method: ${method}`);
          return false;
        }
      }
      
      // Register cache
      this.caches.set(name, cache);
      this.logger.debug(`Registered cache: ${name}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error registering cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Unregister a cache
   * @param {string} name - Cache name
   * @returns {boolean} Whether the cache was unregistered
   */
  unregisterCache(name) {
    try {
      if (!name) {
        return false;
      }
      
      // Check if cache exists
      if (!this.caches.has(name)) {
        return false;
      }
      
      // Get cache
      const cache = this.caches.get(name);
      
      // Shut down cache if it has a shutdown method
      if (typeof cache.shutdown === 'function') {
        try {
          cache.shutdown();
        } catch (error) {
          this.logger.error(`Error shutting down cache '${name}': ${error.message}`);
        }
      }
      
      // Unregister cache
      this.caches.delete(name);
      this.logger.debug(`Unregistered cache: ${name}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error unregistering cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get a cache by name
   * @param {string} name - Cache name
   * @returns {Object|null} Cache instance or null if not found
   */
  getCache(name) {
    if (!name) {
      return null;
    }
    
    return this.caches.get(name) || null;
  }
  
  /**
   * Check if a cache exists
   * @param {string} name - Cache name
   * @returns {boolean} Whether the cache exists
   */
  hasCache(name) {
    if (!name) {
      return false;
    }
    
    return this.caches.has(name);
  }
  
  /**
   * Get all cache names
   * @returns {Array<string>} Array of cache names
   */
  getCacheNames() {
    return Array.from(this.caches.keys());
  }
  
  /**
   * Get a certificate from the cache
   * @param {string|Object} key - Cache key or certificate object
   * @returns {Object|null} Certificate or null if not found
   */
  getCertificate(key) {
    try {
      // Update stats
      this.stats.lookups++;
      
      // Check if certificate cache is enabled
      const certCache = this.caches.get('certificates');
      
      if (!certCache) {
        return null;
      }
      
      // Convert certificate to key if needed
      let cacheKey = key;
      
      if (typeof key === 'object') {
        cacheKey = CacheUtils.generateCacheKey(key);
      }
      
      if (!cacheKey) {
        return null;
      }
      
      // Get certificate
      const certificate = certCache.get(cacheKey);
      
      // Update stats
      if (certificate) {
        this.stats.certHits++;
      } else {
        this.stats.certMisses++;
      }
      
      return certificate;
    } catch (error) {
      this.logger.error(`Error getting certificate: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Set a certificate in the cache
   * @param {Object} certificate - Certificate to cache
   * @returns {boolean} Whether the certificate was cached
   */
  setCertificate(certificate) {
    try {
      // Check if certificate cache is enabled
      const certCache = this.caches.get('certificates');
      
      if (!certCache) {
        return false;
      }
      
      // Generate cache key
      const cacheKey = CacheUtils.generateCacheKey(certificate);
      
      if (!cacheKey) {
        return false;
      }
      
      // Set certificate
      return certCache.set(cacheKey, certificate);
    } catch (error) {
      this.logger.error(`Error setting certificate: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a certificate exists in the cache
   * @param {string|Object} key - Cache key or certificate object
   * @returns {boolean} Whether the certificate exists
   */
  hasCertificate(key) {
    try {
      // Check if certificate cache is enabled
      const certCache = this.caches.get('certificates');
      
      if (!certCache) {
        return false;
      }
      
      // Convert certificate to key if needed
      let cacheKey = key;
      
      if (typeof key === 'object') {
        cacheKey = CacheUtils.generateCacheKey(key);
      }
      
      if (!cacheKey) {
        return false;
      }
      
      // Check if certificate exists
      return certCache.has(cacheKey);
    } catch (error) {
      this.logger.error(`Error checking certificate: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Delete a certificate from the cache
   * @param {string|Object} key - Cache key or certificate object
   * @returns {boolean} Whether the certificate was deleted
   */
  deleteCertificate(key) {
    try {
      // Check if certificate cache is enabled
      const certCache = this.caches.get('certificates');
      
      if (!certCache) {
        return false;
      }
      
      // Convert certificate to key if needed
      let cacheKey = key;
      
      if (typeof key === 'object') {
        cacheKey = CacheUtils.generateCacheKey(key);
      }
      
      if (!cacheKey) {
        return false;
      }
      
      // Delete certificate
      return certCache.delete(cacheKey);
    } catch (error) {
      this.logger.error(`Error deleting certificate: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get a domain from the cache
   * @param {string} domain - Domain to get
   * @returns {Object|null} Domain information or null if not found
   */
  getDomain(domain) {
    try {
      // Update stats
      this.stats.lookups++;
      
      // Check if domain cache is enabled
      const domainCache = this.caches.get('domains');
      
      if (!domainCache || !domain) {
        return null;
      }
      
      // Normalize domain
      const normalizedDomain = CacheUtils.normalizeDomain(domain);
      
      if (!normalizedDomain) {
        return null;
      }
      
      // Get domain
      const domainInfo = domainCache.get(normalizedDomain);
      
      // Update stats
      if (domainInfo) {
        this.stats.domainHits++;
      } else {
        this.stats.domainMisses++;
      }
      
      return domainInfo;
    } catch (error) {
      this.logger.error(`Error getting domain: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Set a domain in the cache
   * @param {string} domain - Domain to cache
   * @param {Object} info - Domain information
   * @returns {boolean} Whether the domain was cached
   */
  setDomain(domain, info) {
    try {
      // Check if domain cache is enabled
      const domainCache = this.caches.get('domains');
      
      if (!domainCache || !domain) {
        return false;
      }
      
      // Normalize domain
      const normalizedDomain = CacheUtils.normalizeDomain(domain);
      
      if (!normalizedDomain) {
        return false;
      }
      
      // Set domain
      return domainCache.set(normalizedDomain, info || { domain: normalizedDomain });
    } catch (error) {
      this.logger.error(`Error setting domain: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a domain exists in the cache
   * @param {string} domain - Domain to check
   * @returns {boolean} Whether the domain exists
   */
  hasDomain(domain) {
    try {
      // Check if domain cache is enabled
      const domainCache = this.caches.get('domains');
      
      if (!domainCache || !domain) {
        return false;
      }
      
      // Normalize domain
      const normalizedDomain = CacheUtils.normalizeDomain(domain);
      
      if (!normalizedDomain) {
        return false;
      }
      
      // Check if domain exists
      return domainCache.has(normalizedDomain);
    } catch (error) {
      this.logger.error(`Error checking domain: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Delete a domain from the cache
   * @param {string} domain - Domain to delete
   * @returns {boolean} Whether the domain was deleted
   */
  deleteDomain(domain) {
    try {
      // Check if domain cache is enabled
      const domainCache = this.caches.get('domains');
      
      if (!domainCache || !domain) {
        return false;
      }
      
      // Normalize domain
      const normalizedDomain = CacheUtils.normalizeDomain(domain);
      
      if (!normalizedDomain) {
        return false;
      }
      
      // Delete domain
      return domainCache.delete(normalizedDomain);
    } catch (error) {
      this.logger.error(`Error deleting domain: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Clear all caches
   * @returns {boolean} Whether all caches were cleared
   */
  clear() {
    try {
      let success = true;
      
      // Clear each cache
      for (const [name, cache] of this.caches.entries()) {
        try {
          const result = cache.clear();
          
          if (result === false) {
            this.logger.warn(`Failed to clear cache: ${name}`);
            success = false;
          }
        } catch (error) {
          this.logger.error(`Error clearing cache '${name}': ${error.message}`);
          success = false;
        }
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Error clearing all caches: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    try {
      // Calculate hit ratios
      const certRatio = this.stats.certHits + this.stats.certMisses > 0
        ? this.stats.certHits / (this.stats.certHits + this.stats.certMisses)
        : 0;
      
      const domainRatio = this.stats.domainHits + this.stats.domainMisses > 0
        ? this.stats.domainHits / (this.stats.domainHits + this.stats.domainMisses)
        : 0;
      
      // Get individual cache stats
      const cacheStats = {};
      
      for (const [name, cache] of this.caches.entries()) {
        cacheStats[name] = cache.getStats();
      }
      
      // Combine stats
      return {
        lookups: this.stats.lookups,
        certificates: {
          hits: this.stats.certHits,
          misses: this.stats.certMisses,
          hitRatio: certRatio.toFixed(2)
        },
        domains: {
          hits: this.stats.domainHits,
          misses: this.stats.domainMisses,
          hitRatio: domainRatio.toFixed(2)
        },
        caches: cacheStats,
        totalCaches: this.caches.size,
        initialized: this.initialized,
        // Legacy stats fields
        size: this.caches.get('certificates')?.getSize() || 0
      };
    } catch (error) {
      this.logger.error(`Error getting cache stats: ${error.message}`);
      return {};
    }
  }
  
  /**
   * Check if a certificate exists in the cache (alias for hasCertificate)
   * @param {string|Object} certificate - Certificate object or key
   * @returns {boolean} Whether the certificate exists
   */
  certificateExists(certificate) {
    return this.hasCertificate(certificate);
  }
  
  /**
   * Add a certificate to the cache (alias for setCertificate)
   * @param {Object} certificate - Certificate to cache
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async addCertificate(certificate) {
    return this.setCertificate(certificate);
  }
  
  /**
   * Set a value in the cache by key
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<boolean>} Promise that resolves to true if successful
   */
  async set(key, value, ttl) {
    try {
      // Get general cache from certificates cache
      const cache = this.caches.get('certificates');
      
      if (!cache) {
        return false;
      }
      
      return cache.set(key, value);
    } catch (error) {
      this.logger.error(`Error setting cache value: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get a value from the cache by key
   * @param {string} key - Cache key
   * @returns {Promise<any>} Promise that resolves to the cached value or null
   */
  async get(key) {
    return this.caches.get('certificates')?.get(key) || null;
  }
}

// Make CacheUtils available as a static property of CacheManager for compatibility
CacheManager.CacheUtils = CacheUtils;

module.exports = CacheManager;
module.exports.CacheUtils = CacheUtils;
module.exports.LruCache = LruCache;