/**
 * CertStream provider for Certificate Transparency logs
 * 
 * This provider connects to the CertStream WebSocket service which
 * aggregates certificate data from multiple CT logs.
 */
const WebSocket = require('ws');
const BaseProvider = require('./base-provider');

class CertStreamProvider extends BaseProvider {
  /**
   * Create a new CertStream provider
   * @param {Object} options - Provider configuration options
   */
  constructor(options = {}) {
    super(options);
    this.name = 'certstream';
    this.config = options; // Store the full config
    this.logger = options.logger; // Reference to logger
    
    // Set WebSocket URL
    this.wsUrl = options.certstreamWsUrl || 'wss://certstream.calidog.io/';
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.reconnectTimeoutId = null;
  }

  /**
   * Initialize the provider
   * @returns {Promise<void>}
   */
  async initialize() {
    this.logger.info(`Initializing ${this.name} provider with URL: ${this.wsUrl}`);
    return Promise.resolve();
  }

  /**
   * Connect to the CertStream WebSocket service
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.logger.info(`Connecting to CertStream WebSocket at ${this.wsUrl}`);
        
        // Create WebSocket connection
        this.ws = new WebSocket(this.wsUrl);
        
        // Set up event handlers
        this.ws.on('open', () => {
          this.logger.info('Connected to CertStream WebSocket');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });
        
        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });
        
        this.ws.on('error', (error) => {
          this.logger.error('CertStream WebSocket error:', error.message);
          this.emit('error', error);
        });
        
        this.ws.on('close', (code, reason) => {
          this.logger.warn(`CertStream WebSocket closed: ${code} - ${reason}`);
          this.isConnected = false;
          
          // Attempt to reconnect if we were previously running
          if (this.isRunning) {
            this.attemptReconnect();
          }
        });
      } catch (error) {
        this.logger.error('Failed to connect to CertStream:', error.message);
        this.isConnected = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the CertStream WebSocket service
   * @returns {Promise<void>}
   */
  async disconnect() {
    return new Promise((resolve) => {
      if (!this.ws) {
        this.isConnected = false;
        this.isRunning = false;
        resolve();
        return;
      }
      
      // Clear any pending reconnect attempts
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
      
      // Close the WebSocket connection
      this.ws.on('close', () => {
        this.logger.info('Disconnected from CertStream WebSocket');
        this.isConnected = false;
        this.isRunning = false;
        this.ws = null;
        resolve();
      });
      
      this.ws.close();
    });
  }

  /**
   * Attempt to reconnect to the CertStream WebSocket service
   * @private
   */
  attemptReconnect() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      this.emit('error', new Error('Max reconnect attempts reached'));
      this.isRunning = false;
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
    
    this.logger.info(`Attempting to reconnect to CertStream (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
    
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error('Reconnect attempt failed:', error.message);
        // The next reconnect attempt will be scheduled by the 'close' event handler
      });
    }, delay);
  }

  /**
   * Handle a message from the CertStream WebSocket
   * @param {string} data - The raw message data
   * @private
   */
  handleMessage(data) {
    try {
      // Parse the message
      const message = JSON.parse(data.toString());
      
      // Check the message type
      switch (message.message_type) {
        case 'certificate_update':
          this.handleCertificateUpdate(message);
          break;
        
        case 'heartbeat':
          this.logger.debug('Received heartbeat from CertStream');
          break;
        
        default:
          this.logger.debug(`Received unknown message type: ${message.message_type}`);
      }
    } catch (error) {
      this.logger.error('Error processing CertStream message:', error.message);
    }
  }

  /**
   * Handle a certificate update message
   * @param {Object} message - The certificate update message
   * @private
   */
  handleCertificateUpdate(message) {
    try {
      // Extract the relevant certificate data
      const certData = {
        timestamp: new Date().toISOString(),
        certificate: {
          subject: {
            common_name: this.extractCommonName(message),
            organization: this.extractOrganization(message),
            // Add other subject fields as needed
          },
          issuer: {
            common_name: this.extractIssuerName(message),
            // Add other issuer fields as needed
          },
          validity: {
            not_before: message.data.leaf_cert.not_before,
            not_after: message.data.leaf_cert.not_after,
          },
          serial_number: message.data.leaf_cert.serial_number || '',
          fingerprint: {
            sha256: message.data.leaf_cert.fingerprint,
          },
        },
        ct_logs: [{
          log_name: message.data.source.name || 'Unknown',
          log_id: message.data.source.url || '',
        }],
        domains: message.data.leaf_cert.all_domains || [],
      };
      
      // Emit the certificate event
      this.emit('certificate', certData);
      
    } catch (error) {
      this.logger.error('Error processing certificate update:', error.message);
    }
  }

  /**
   * Extract the common name from the certificate data
   * @param {Object} message - The certificate update message
   * @returns {string} The common name
   * @private
   */
  extractCommonName(message) {
    try {
      // Try to get the first domain from all_domains
      if (message.data.leaf_cert.all_domains && message.data.leaf_cert.all_domains.length > 0) {
        return message.data.leaf_cert.all_domains[0];
      }
      
      // If that fails, try to extract it from the subject
      if (message.data.leaf_cert.subject && message.data.leaf_cert.subject.CN) {
        return message.data.leaf_cert.subject.CN;
      }
      
      return 'Unknown';
    } catch (error) {
      this.logger.debug('Error extracting common name:', error.message);
      return 'Unknown';
    }
  }

  /**
   * Extract the organization from the certificate data
   * @param {Object} message - The certificate update message
   * @returns {string} The organization
   * @private
   */
  extractOrganization(message) {
    try {
      if (message.data.leaf_cert.subject && message.data.leaf_cert.subject.O) {
        return message.data.leaf_cert.subject.O;
      }
      
      return 'Unknown';
    } catch (error) {
      this.logger.debug('Error extracting organization:', error.message);
      return 'Unknown';
    }
  }

  /**
   * Extract the issuer name from the certificate data
   * @param {Object} message - The certificate update message
   * @returns {string} The issuer name
   * @private
   */
  extractIssuerName(message) {
    try {
      if (message.data.leaf_cert.issuer && message.data.leaf_cert.issuer.CN) {
        return message.data.leaf_cert.issuer.CN;
      }
      
      return 'Unknown';
    } catch (error) {
      this.logger.debug('Error extracting issuer name:', error.message);
      return 'Unknown';
    }
  }
}

module.exports = CertStreamProvider;