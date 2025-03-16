/**
 * CT-Stream API Integration Example
 * 
 * This example demonstrates how to integrate the CT-Stream library with an Express API
 * to expose certificate transparency data via a REST API.
 * 
 * Prerequisites:
 * npm install express cors
 */

const express = require('express');
const cors = require('cors');
const CTStreamMonitor = require('../src/index');
const DomainExtractor = require('../modules/domain-extractor');
const fs = require('fs').promises;
const path = require('path');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Create a custom logger
const logger = {
  debug: (message) => console.log(`[DEBUG] ${message}`),
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.log(`[WARN] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`)
};

// Create monitor with options
const monitor = new CTStreamMonitor({
  provider: {
    url: 'wss://certstream.calidog.io/',
    skipHeartbeats: true
  },
  cache: {
    enabled: true,
    certificates: {
      enabled: true,
      maxSize: 5000
    },
    domains: {
      enabled: true,
      maxSize: 50000
    }
  },
  autoStart: false
}, logger);

// Create domain extractor module
const domainExtractor = new DomainExtractor({
  maxDomains: 50000,
  trackWildcards: true
}, logger);

// Register the domain extractor module
monitor.registerModule('domain-extractor', domainExtractor);

// Recent certificates storage
const recentCertificates = [];
const MAX_RECENT_CERTS = 100;

// Set up event handlers
monitor.on('certificate', (data) => {
  // Store recent certificates
  if (recentCertificates.length >= MAX_RECENT_CERTS) {
    recentCertificates.shift(); // Remove oldest certificate
  }
  recentCertificates.push(data);
});

monitor.on('error', (error) => {
  logger.error(`Monitor error: ${error.message}`);
});

// Start the monitor
(async () => {
  try {
    logger.info('Initializing monitor...');
    await monitor.initialize();
    
    logger.info('Starting monitor...');
    await monitor.start();
    
    // Set up domain save interval (every 5 minutes)
    setInterval(async () => {
      try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const filePath = path.join(__dirname, '..', 'data', `domains-${timestamp}.json`);
        
        // Create directory if it doesn't exist
        await fs.mkdir(path.join(__dirname, '..', 'data'), { recursive: true });
        
        // Save domains
        await domainExtractor.saveDomains(filePath, {
          format: 'json',
          includeWildcards: true,
          includeMetadata: true
        });
        
        logger.info(`Domains saved to ${filePath}`);
      } catch (error) {
        logger.error(`Error saving domains: ${error.message}`);
      }
    }, 5 * 60 * 1000);
    
    // Start the API server
    app.listen(PORT, () => {
      logger.info(`API server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error(`Failed to start monitor: ${error.message}`);
    process.exit(1);
  }
})();

// API Routes

// Get monitor status
app.get('/api/status', (req, res) => {
  const stats = monitor.getStats();
  
  // Simplify stats for API response
  const status = {
    running: stats.monitor.running,
    uptime: stats.monitor.runtime.formatted,
    certificates: {
      processed: stats.monitor.certificates.processed,
      perSecond: stats.monitor.certificates.perSecond,
      lastSeen: stats.monitor.certificates.lastSeen
    },
    domains: {
      unique: stats.modules['domain-extractor']?.domains?.unique || 0,
      wildcard: stats.modules['domain-extractor']?.domains?.wildcard || 0,
      total: stats.modules['domain-extractor']?.domains?.total || 0
    },
    provider: {
      connected: stats.provider.connected,
      reconnectAttempts: stats.provider.reconnectAttempts
    }
  };
  
  res.json(status);
});

// Get recent certificates
app.get('/api/certificates/recent', (req, res) => {
  // Get limit parameter with default
  const limit = parseInt(req.query.limit) || MAX_RECENT_CERTS;
  const certs = recentCertificates.slice(-limit);
  
  res.json({
    count: certs.length,
    certificates: certs
  });
});

// Search domains
app.get('/api/domains/search', (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({
      error: 'Missing query parameter'
    });
  }
  
  try {
    // Search domains
    const domains = Array.from(domainExtractor.domains.keys());
    const results = domains.filter(domain => domain.includes(query));
    
    res.json({
      query,
      count: results.length,
      domains: results.slice(0, 100) // Limit to 100 results
    });
  } catch (error) {
    res.status(500).json({
      error: `Error searching domains: ${error.message}`
    });
  }
});

// Check if domain exists
app.get('/api/domains/check/:domain', (req, res) => {
  const { domain } = req.params;
  
  if (!domain) {
    return res.status(400).json({
      error: 'Missing domain parameter'
    });
  }
  
  try {
    const exists = domainExtractor.hasDomain(domain);
    const info = exists ? domainExtractor.getDomainInfo(domain) : null;
    
    res.json({
      domain,
      exists,
      info
    });
  } catch (error) {
    res.status(500).json({
      error: `Error checking domain: ${error.message}`
    });
  }
});

// Get domain statistics
app.get('/api/domains/stats', (req, res) => {
  try {
    const stats = domainExtractor.getStats();
    
    res.json({
      domains: stats.domains,
      certificates: stats.certificates
    });
  } catch (error) {
    res.status(500).json({
      error: `Error getting domain stats: ${error.message}`
    });
  }
});

// Get top-level domains
app.get('/api/domains/tlds', (req, res) => {
  try {
    const domains = Array.from(domainExtractor.domains.keys());
    const tldMap = {};
    
    // Count TLDs
    domains.forEach(domain => {
      const parts = domain.split('.');
      if (parts.length > 1) {
        const tld = parts[parts.length - 1];
        tldMap[tld] = (tldMap[tld] || 0) + 1;
      }
    });
    
    // Convert to array and sort
    const tlds = Object.entries(tldMap).map(([tld, count]) => ({
      tld,
      count
    }));
    
    tlds.sort((a, b) => b.count - a.count);
    
    res.json({
      count: tlds.length,
      tlds: tlds.slice(0, 20) // Return top 20
    });
  } catch (error) {
    res.status(500).json({
      error: `Error getting TLDs: ${error.message}`
    });
  }
});

// Handle graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down API server...');
  
  // Save domains before shutting down
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filePath = path.join(__dirname, '..', 'data', `domains-${timestamp}-shutdown.json`);
    
    // Create directory if it doesn't exist
    await fs.mkdir(path.join(__dirname, '..', 'data'), { recursive: true });
    
    // Save domains
    await domainExtractor.saveDomains(filePath, {
      format: 'json',
      includeWildcards: true,
      includeMetadata: true
    });
    
    logger.info(`Final domains saved to ${filePath}`);
  } catch (error) {
    logger.error(`Error saving domains: ${error.message}`);
  }
  
  logger.info('Shutting down monitor...');
  await monitor.shutdown();
  
  process.exit(0);
};

// Listen for shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);