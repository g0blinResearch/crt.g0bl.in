/**
 * Domain Watchlist Module
 * 
 * This module monitors Certificate Transparency logs for certificates
 * issued for domains on a watchlist. It's useful for detecting when
 * certificates are issued for your domains or similar looking domains
 * that might be used in phishing attacks.
 */

class DomainWatchlist {
  /**
   * Initialize the Domain Watchlist module
   * @param {Object} config - Module configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config || {};
    this.logger = logger;
    this.name = 'domain-watchlist';
    
    // Initialize configuration
    this.domains = this.config.domains || [];
    this.watchForSimilar = this.config.watchForSimilar !== false;
    this.alertThreshold = this.config.alertThreshold || 1;
    this.ignoredIssuers = this.config.ignoredIssuers || [];
    
    // Initialize stats
    this.matches = 0;
    this.processedCount = 0;
    this.alertsSent = 0;
    
    // Track per-domain matches
    this.domainMatches = new Map();
    
    // Initialize domain tracking
    for (const domain of this.domains) {
      this.domainMatches.set(domain, 0);
    }
  }
  
  /**
   * Initialize the module
   * @returns {Promise<void>}
   */
  async initialize() {
    this.logger.info(`Domain Watchlist module initialized with ${this.domains.length} domains`);
    if (this.domains.length > 0) {
      this.logger.debug(`Watching domains: ${this.domains.join(', ')}`);
    } else {
      this.logger.warn('No domains configured for watchlist');
    }
    
    return Promise.resolve();
  }
  
  /**
   * Process a certificate and check against watchlist
   * @param {Object} certificate - Certificate data
   * @returns {Promise<Object>} Analysis results
   */
  async process(certificate) {
    this.processedCount++;
    
    // Skip processing if no domains configured
    if (this.domains.length === 0) {
      return { matched: false, message: 'No domains configured for watchlist' };
    }
    
    // Extract certificate data
    const certDomains = this.extractDomains(certificate);
    const issuer = this.extractIssuer(certificate);
    
    // Skip if issuer is in ignored list
    if (this.isIgnoredIssuer(issuer)) {
      return { 
        matched: false, 
        message: `Ignored issuer: ${issuer.CN || issuer.O || 'Unknown'}`
      };
    }
    
    // Check for exact domain matches
    const exactMatches = this.findExactMatches(certDomains);
    
    // Check for similar domain matches if enabled
    const similarMatches = this.watchForSimilar 
      ? this.findSimilarMatches(certDomains) 
      : [];
    
    // Combine all matches
    const allMatches = [...exactMatches, ...similarMatches];
    
    if (allMatches.length > 0) {
      this.matches++;
      
      // Update per-domain match counts
      for (const match of exactMatches) {
        const count = this.domainMatches.get(match.watchlistDomain) || 0;
        this.domainMatches.set(match.watchlistDomain, count + 1);
      }
      
      // Check if alert threshold is reached
      const shouldAlert = exactMatches.some(match => {
        const count = this.domainMatches.get(match.watchlistDomain) || 0;
        return count >= this.alertThreshold;
      });
      
      if (shouldAlert) {
        this.alertsSent++;
      }
      
      return {
        matched: true,
        exactMatches,
        similarMatches,
        matchCount: allMatches.length,
        certificate: {
          issuer: issuer.CN || issuer.O || 'Unknown',
          validFrom: certificate.data?.leaf_cert?.not_before,
          validTo: certificate.data?.leaf_cert?.not_after
        },
        shouldAlert,
        alertCount: this.alertsSent,
        stats: {
          processed: this.processedCount,
          matches: this.matches
        }
      };
    }
    
    return {
      matched: false,
      processed: this.processedCount
    };
  }
  
  /**
   * Clean up module resources
   * @returns {Promise<void>}
   */
  async destroy() {
    this.logger.info('Domain Watchlist module destroyed');
    this.logger.info(`Final stats: Processed ${this.processedCount} certificates, found ${this.matches} matches, sent ${this.alertsSent} alerts`);
    
    // Log per-domain matches if any found
    if (this.matches > 0) {
      this.logger.info('Matches per domain:');
      for (const [domain, count] of this.domainMatches.entries()) {
        if (count > 0) {
          this.logger.info(`  ${domain}: ${count} matches`);
        }
      }
    }
    
    return Promise.resolve();
  }
  
  /**
   * Extract domains from certificate
   * @param {Object} certificate - Certificate data
   * @returns {Array<string>} Array of domains
   */
  extractDomains(certificate) {
    const domains = new Set();
    
    try {
      // Add leaf certificate CN
      if (certificate.data?.leaf_cert?.subject?.CN) {
        domains.add(certificate.data.leaf_cert.subject.CN.toLowerCase());
      }
      
      // Add SANs
      if (certificate.data?.leaf_cert?.extensions?.subjectAltName) {
        const sans = certificate.data.leaf_cert.extensions.subjectAltName;
        const dnsNames = sans.match(/DNS:[^,]+/g) || [];
        
        for (const dns of dnsNames) {
          domains.add(dns.replace('DNS:', '').trim().toLowerCase());
        }
      }
    } catch (error) {
      this.logger.debug(`Error extracting domains: ${error.message}`);
    }
    
    return [...domains]; // Convert Set to Array
  }
  
  /**
   * Extract issuer information from certificate
   * @param {Object} certificate - Certificate data
   * @returns {Object} Issuer information
   */
  extractIssuer(certificate) {
    try {
      const issuer = certificate.data?.leaf_cert?.issuer || {};
      
      return {
        CN: issuer.CN || '',
        O: issuer.O || '',
        C: issuer.C || '',
        raw: issuer
      };
    } catch (error) {
      this.logger.debug(`Error extracting issuer: ${error.message}`);
      return { CN: '', O: '', C: '', raw: {} };
    }
  }
  
  /**
   * Check if issuer should be ignored
   * @param {Object} issuer - Issuer information
   * @returns {boolean} True if issuer should be ignored
   */
  isIgnoredIssuer(issuer) {
    for (const ignored of this.ignoredIssuers) {
      if (
        (ignored.CN && issuer.CN.includes(ignored.CN)) ||
        (ignored.O && issuer.O.includes(ignored.O))
      ) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Find exact matches between certificate domains and watchlist
   * @param {Array<string>} certDomains - Certificate domains
   * @returns {Array<Object>} Matching details
   */
  findExactMatches(certDomains) {
    const matches = [];
    
    for (const certDomain of certDomains) {
      for (const watchlistDomain of this.domains) {
        // Check for exact match
        if (certDomain === watchlistDomain.toLowerCase()) {
          matches.push({
            type: 'exact',
            certDomain,
            watchlistDomain,
            matchReason: 'exact-match'
          });
          continue;
        }
        
        // Check for subdomain match
        if (certDomain.endsWith(`.${watchlistDomain.toLowerCase()}`)) {
          matches.push({
            type: 'subdomain',
            certDomain,
            watchlistDomain,
            matchReason: 'subdomain-match'
          });
        }
      }
    }
    
    return matches;
  }
  
  /**
   * Find similar matches (potential typosquatting)
   * @param {Array<string>} certDomains - Certificate domains
   * @returns {Array<Object>} Matching details
   */
  findSimilarMatches(certDomains) {
    const matches = [];
    
    for (const certDomain of certDomains) {
      for (const watchlistDomain of this.domains) {
        // Skip if already an exact match
        if (certDomain === watchlistDomain.toLowerCase() || 
            certDomain.endsWith(`.${watchlistDomain.toLowerCase()}`)) {
          continue;
        }
        
        // Check for homograph attacks (similar looking characters)
        if (this.isHomographSimilar(certDomain, watchlistDomain)) {
          matches.push({
            type: 'similar',
            certDomain,
            watchlistDomain,
            matchReason: 'homograph-similar'
          });
          continue;
        }
        
        // Check for Levenshtein distance similarity
        if (this.isLevenshteinSimilar(certDomain, watchlistDomain)) {
          matches.push({
            type: 'similar',
            certDomain,
            watchlistDomain,
            matchReason: 'levenshtein-similar'
          });
          continue;
        }
        
        // Check for common typosquatting patterns
        if (this.isTypoSquatting(certDomain, watchlistDomain)) {
          matches.push({
            type: 'similar',
            certDomain,
            watchlistDomain,
            matchReason: 'typosquatting-pattern'
          });
        }
      }
    }
    
    return matches;
  }
  
  /**
   * Check if two domains are similar using homograph analysis
   * @param {string} domain1 - First domain
   * @param {string} domain2 - Second domain
   * @returns {boolean} True if domains are similar
   */
  isHomographSimilar(domain1, domain2) {
    // Simple homograph check (could be expanded with more character mappings)
    const homographMap = {
      '0': 'o', 'o': '0',
      '1': 'l', 'l': '1', 'i': '1',
      'm': 'rn', 'rn': 'm',
      'w': 'vv', 'vv': 'w'
    };
    
    // Normalize domains for comparison
    const domain1Base = domain1.split('.')[0];
    const domain2Base = domain2.split('.')[0];
    
    // Check if replacing homographs in domain1 equals domain2
    for (const [char, replacement] of Object.entries(homographMap)) {
      if (domain1Base.includes(char)) {
        const normalized = domain1Base.replace(new RegExp(char, 'g'), replacement);
        if (normalized === domain2Base) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Check if two domains are similar using Levenshtein distance
   * @param {string} domain1 - First domain
   * @param {string} domain2 - Second domain
   * @returns {boolean} True if domains are similar
   */
  isLevenshteinSimilar(domain1, domain2) {
    // Extract base domains without TLD
    const domain1Base = domain1.split('.')[0];
    const domain2Base = domain2.split('.')[0];
    
    // Skip very short domains (less than 4 chars)
    if (domain1Base.length < 4 || domain2Base.length < 4) {
      return false;
    }
    
    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(domain1Base, domain2Base);
    
    // Define threshold based on domain length
    const minLength = Math.min(domain1Base.length, domain2Base.length);
    let threshold = 1; // Default for short domains
    
    if (minLength >= 10) {
      threshold = 2;
    } else if (minLength >= 6) {
      threshold = 1;
    }
    
    return distance <= threshold;
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} s1 - First string
   * @param {string} s2 - Second string
   * @returns {number} Levenshtein distance
   */
  levenshteinDistance(s1, s2) {
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;
    
    const matrix = [];
    
    // Initialize matrix
    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let j = 1; j <= s2.length; j++) {
      for (let i = 1; i <= s1.length; i++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return matrix[s1.length][s2.length];
  }
  
  /**
   * Check for common typosquatting patterns
   * @param {string} domain1 - Certificate domain
   * @param {string} domain2 - Watchlist domain
   * @returns {boolean} True if domain1 is likely a typosquat of domain2
   */
  isTypoSquatting(domain1, domain2) {
    // Extract base domains without TLD
    const domain1Base = domain1.split('.')[0].toLowerCase();
    const domain2Base = domain2.split('.')[0].toLowerCase();
    
    // Character insertion (e.g., googgle.com)
    if (this.hasCharacterInsertion(domain1Base, domain2Base)) {
      return true;
    }
    
    // Character substitution with adjacent keys (e.g., foogle.com)
    if (this.hasAdjacentKeySubstitution(domain1Base, domain2Base)) {
      return true;
    }
    
    // Character transposition (e.g., googel.com)
    if (this.hasCharacterTransposition(domain1Base, domain2Base)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if one domain is the other with an inserted character
   * @param {string} domain1 - First domain
   * @param {string} domain2 - Second domain
   * @returns {boolean} True if one domain has an inserted character
   */
  hasCharacterInsertion(domain1, domain2) {
    // If length difference is not 1, not a simple insertion
    if (Math.abs(domain1.length - domain2.length) !== 1) {
      return false;
    }
    
    // Ensure domain1 is longer
    const longer = domain1.length > domain2.length ? domain1 : domain2;
    const shorter = domain1.length > domain2.length ? domain2 : domain1;
    
    // Check for insertion
    for (let i = 0; i <= longer.length; i++) {
      const candidate = longer.slice(0, i) + longer.slice(i + 1);
      if (candidate === shorter) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if domains differ by a transposition of adjacent characters
   * @param {string} domain1 - First domain
   * @param {string} domain2 - Second domain
   * @returns {boolean} True if domains differ by transposition
   */
  hasCharacterTransposition(domain1, domain2) {
    // If length difference, not a simple transposition
    if (domain1.length !== domain2.length) {
      return false;
    }
    
    for (let i = 0; i < domain1.length - 1; i++) {
      // Create transposed version
      const transposed = 
        domain1.slice(0, i) + 
        domain1[i + 1] + 
        domain1[i] + 
        domain1.slice(i + 2);
      
      if (transposed === domain2) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if domains differ by substitution of adjacent keyboard keys
   * @param {string} domain1 - First domain
   * @param {string} domain2 - Second domain
   * @returns {boolean} True if domains differ by adjacent key substitution
   */
  hasAdjacentKeySubstitution(domain1, domain2) {
    // If length difference, not a simple substitution
    if (domain1.length !== domain2.length) {
      return false;
    }
    
    // Map of adjacent keys on QWERTY keyboard
    const adjacentKeys = {
      'q': ['w', '1', '2'],
      'w': ['q', 'e', '2', '3'],
      'e': ['w', 'r', '3', '4'],
      'r': ['e', 't', '4', '5'],
      't': ['r', 'y', '5', '6'],
      'y': ['t', 'u', '6', '7'],
      'u': ['y', 'i', '7', '8'],
      'i': ['u', 'o', '8', '9'],
      'o': ['i', 'p', '9', '0'],
      'p': ['o', '[', '0', '-'],
      'a': ['q', 'w', 's', 'z'],
      's': ['a', 'd', 'w', 'e', 'x', 'z'],
      'd': ['s', 'f', 'e', 'r', 'c', 'x'],
      'f': ['d', 'g', 'r', 't', 'v', 'c'],
      'g': ['f', 'h', 't', 'y', 'b', 'v'],
      'h': ['g', 'j', 'y', 'u', 'n', 'b'],
      'j': ['h', 'k', 'u', 'i', 'm', 'n'],
      'k': ['j', 'l', 'i', 'o', ',', 'm'],
      'l': ['k', ';', 'o', 'p', '.', ','],
      'z': ['a', 's', 'x'],
      'x': ['z', 's', 'd', 'c'],
      'c': ['x', 'd', 'f', 'v'],
      'v': ['c', 'f', 'g', 'b'],
      'b': ['v', 'g', 'h', 'n'],
      'n': ['b', 'h', 'j', 'm'],
      'm': ['n', 'j', 'k', ',']
    };
    
    // Find positions where domains differ
    const diffPositions = [];
    for (let i = 0; i < domain1.length; i++) {
      if (domain1[i] !== domain2[i]) {
        diffPositions.push(i);
      }
    }
    
    // If more than 2 differences, not a simple substitution
    if (diffPositions.length > 2) {
      return false;
    }
    
    // Check each difference to see if it's an adjacent key
    for (const pos of diffPositions) {
      const char1 = domain1[pos];
      const char2 = domain2[pos];
      
      // Check if char2 is adjacent to char1
      if (adjacentKeys[char1] && adjacentKeys[char1].includes(char2)) {
        return true;
      }
      
      // Check if char1 is adjacent to char2
      if (adjacentKeys[char2] && adjacentKeys[char2].includes(char1)) {
        return true;
      }
    }
    
    return false;
  }
}

module.exports = DomainWatchlist;