/**
 * Certificate Intelligence Module
 * 
 * This module analyzes certificate data to provide intelligence
 * and risk assessment based on certificate properties.
 */

class CertificateIntelligence {
  /**
   * Initialize the Certificate Intelligence module
   * @param {Object} config - Module configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config || {};
    this.logger = logger;
    this.name = 'certificate-intelligence';
    
    // Initialize configuration
    this.maxCertificates = this.config.maxCertificates || 10000;
    this.highRiskIssuers = this.config.highRiskIssuers || [];
    this.suspiciousTLDs = this.config.suspiciousTLDs || [
      '.tk', '.ml', '.ga', '.cf', '.gq', // Free TLDs often abused
      '.xyz', '.top', '.work', '.date', '.racing' // Inexpensive TLDs
    ];
    
    // Initialize counters
    this.processedCount = 0;
    this.highRiskCount = 0;
    this.mediumRiskCount = 0;
    this.lowRiskCount = 0;
  }
  
  /**
   * Initialize the module
   * @returns {Promise<void>}
   */
  async initialize() {
    this.logger.info(`Certificate Intelligence module initialized`);
    this.logger.debug(`Configuration: ${JSON.stringify({
      maxCertificates: this.maxCertificates,
      highRiskIssuers: this.highRiskIssuers,
      suspiciousTLDs: this.suspiciousTLDs
    })}`);
    
    return Promise.resolve();
  }
  
  /**
   * Process a certificate and perform intelligence analysis
   * @param {Object} certificate - Certificate data
   * @returns {Promise<Object>} Analysis results
   */
  async process(certificate) {
    this.processedCount++;
    
    // Extract certificate data
    const domains = this.extractDomains(certificate);
    const issuer = this.extractIssuer(certificate);
    const validityPeriod = this.calculateValidityPeriod(certificate);
    
    // Perform analysis
    const riskFactors = [];
    let riskLevel = 'low';
    
    // Check issuer reputation
    if (this.isHighRiskIssuer(issuer)) {
      riskFactors.push('high-risk-issuer');
      riskLevel = 'high';
    }
    
    // Check for extremely short validity period (less than 7 days)
    if (validityPeriod < 7) {
      riskFactors.push('short-validity');
      riskLevel = this.upgradeRisk(riskLevel, 'medium');
    }
    
    // Check for extremely long validity period (more than 825 days / 27 months)
    if (validityPeriod > 825) {
      riskFactors.push('long-validity');
      riskLevel = this.upgradeRisk(riskLevel, 'medium');
    }
    
    // Check for suspicious TLDs
    const suspiciousDomains = this.findSuspiciousDomains(domains);
    if (suspiciousDomains.length > 0) {
      riskFactors.push('suspicious-tld');
      riskLevel = this.upgradeRisk(riskLevel, 'medium');
    }
    
    // Check for large number of domains (potential wildcard abuse)
    if (domains.length > 100) {
      riskFactors.push('many-domains');
      riskLevel = this.upgradeRisk(riskLevel, 'medium');
    }
    
    // Check for suspicious keywords in domains
    const suspiciousKeywords = this.findSuspiciousKeywords(domains);
    if (suspiciousKeywords.length > 0) {
      riskFactors.push('suspicious-keywords');
      riskLevel = this.upgradeRisk(riskLevel, 'high');
    }
    
    // Update risk counters
    switch (riskLevel) {
      case 'high':
        this.highRiskCount++;
        break;
      case 'medium':
        this.mediumRiskCount++;
        break;
      case 'low':
        this.lowRiskCount++;
        break;
    }
    
    // Return analysis results
    return {
      riskLevel,
      riskFactors,
      domains: {
        count: domains.length,
        suspicious: suspiciousDomains
      },
      issuer,
      validityPeriod,
      keywords: suspiciousKeywords,
      stats: {
        processed: this.processedCount,
        highRisk: this.highRiskCount,
        mediumRisk: this.mediumRiskCount,
        lowRisk: this.lowRiskCount
      }
    };
  }
  
  /**
   * Clean up module resources
   * @returns {Promise<void>}
   */
  async destroy() {
    this.logger.info('Certificate Intelligence module destroyed');
    this.logger.info(`Final stats: Processed ${this.processedCount} certificates (${this.highRiskCount} high risk, ${this.mediumRiskCount} medium risk, ${this.lowRiskCount} low risk)`);
    
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
        domains.add(certificate.data.leaf_cert.subject.CN);
      }
      
      // Add SANs
      if (certificate.data?.leaf_cert?.extensions?.subjectAltName) {
        const sans = certificate.data.leaf_cert.extensions.subjectAltName;
        const dnsNames = sans.match(/DNS:[^,]+/g) || [];
        
        for (const dns of dnsNames) {
          domains.add(dns.replace('DNS:', '').trim());
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
   * Calculate certificate validity period in days
   * @param {Object} certificate - Certificate data
   * @returns {number} Validity period in days
   */
  calculateValidityPeriod(certificate) {
    try {
      const notBefore = certificate.data?.leaf_cert?.not_before;
      const notAfter = certificate.data?.leaf_cert?.not_after;
      
      if (notBefore && notAfter) {
        // Handle Unix timestamps
        if (typeof notBefore === 'number' && typeof notAfter === 'number') {
          const validitySeconds = notAfter - notBefore;
          return Math.floor(validitySeconds / 86400); // Convert seconds to days
        }
        
        // Handle ISO date strings
        const startDate = new Date(notBefore);
        const endDate = new Date(notAfter);
        const validityMs = endDate.getTime() - startDate.getTime();
        return Math.floor(validityMs / (1000 * 60 * 60 * 24)); // Convert ms to days
      }
      
      return 0;
    } catch (error) {
      this.logger.debug(`Error calculating validity period: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Check if an issuer is in the high-risk list
   * @param {Object} issuer - Issuer information
   * @returns {boolean} True if high risk
   */
  isHighRiskIssuer(issuer) {
    // Check against configured high-risk issuers
    for (const highRiskIssuer of this.highRiskIssuers) {
      if (
        (highRiskIssuer.CN && issuer.CN.includes(highRiskIssuer.CN)) ||
        (highRiskIssuer.O && issuer.O.includes(highRiskIssuer.O))
      ) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Find domains with suspicious TLDs
   * @param {Array<string>} domains - List of domains
   * @returns {Array<string>} Suspicious domains
   */
  findSuspiciousDomains(domains) {
    return domains.filter(domain => {
      for (const tld of this.suspiciousTLDs) {
        if (domain.endsWith(tld)) {
          return true;
        }
      }
      return false;
    });
  }
  
  /**
   * Find suspicious keywords in domains
   * @param {Array<string>} domains - List of domains
   * @returns {Array<string>} Suspicious keywords found
   */
  findSuspiciousKeywords(domains) {
    const suspiciousKeywords = [
      'login', 'account', 'secure', 'bank', 'verify',
      'wallet', 'auth', 'signin', 'security', 'update'
    ];
    
    const found = new Set();
    
    for (const domain of domains) {
      for (const keyword of suspiciousKeywords) {
        if (domain.includes(keyword)) {
          found.add(keyword);
        }
      }
    }
    
    return [...found]; // Convert Set to Array
  }
  
  /**
   * Upgrade risk level if new level is higher
   * @param {string} currentLevel - Current risk level
   * @param {string} newLevel - New risk level
   * @returns {string} Higher risk level
   */
  upgradeRisk(currentLevel, newLevel) {
    const levels = { 'low': 1, 'medium': 2, 'high': 3 };
    
    if (levels[newLevel] > levels[currentLevel]) {
      return newLevel;
    }
    
    return currentLevel;
  }
}

module.exports = CertificateIntelligence;