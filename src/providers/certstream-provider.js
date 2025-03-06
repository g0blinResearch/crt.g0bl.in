/**
 * CertStream Provider
 * 
 * This module provides a connection to the CertStream WebSocket service,
 * which streams Certificate Transparency log entries in real-time.
 * 
 * @module providers/certstream-provider
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * CertStream Provider
 * 
 * Provider for the CertStream WebSocket service.
 * 
 * @extends EventEmitter
 */
class CertstreamProvider extends EventEmitter {
  /**
   * Create a new CertStream provider
   * @param {Object} options - Provider options
   * @param {string} options.url - WebSocket URL
   * @param {boolean} options.skipHeartbeats - Whether to skip heartbeat messages
   * @param {number} options.reconnectDelay - Reconnect delay in milliseconds
   * @param {number} options.maxReconnectAttempts - Maximum reconnect attempts
   * @param {Object} logger - Logger instance
   */
  constructor(options = {}, logger = console) {
    super();
    
    // Set options with defaults
    this.options = {
      url: 'wss://certstream.calidog.io/',
      skipHeartbeats: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 10,
      ...options
    };
    
    this.logger = logger;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.connectTime = null;
    
    // Statistics
    this.stats = {
      connectCount: 0,
      disconnectCount: 0,
      reconnectAttempts: 0,
      messageCount: 0,
      certificateCount: 0,
      heartbeatCount: 0,
      errorCount: 0,
      lastConnectTime: null,
      lastDisconnectTime: null,
      totalConnectedTime: 0,
      dataReceived: 0
    };
  }
  
  /**
   * Start the provider
   * @returns {Promise<void>} Promise that resolves when connected
   */
  start() {
    return new Promise((resolve, reject) => {
      try {
        // Check if already connected
        if (this.connected && this.ws) {
          this.logger.debug('Already connected to CertStream');
          return resolve();
        }
        
        // Reset reconnect attempts
        this.reconnectAttempts = 0;
        
        // Connect to WebSocket
        this._connect()
          .then(() => resolve())
          .catch(error => reject(error));
      } catch (error) {
        this.logger.error(`Error starting CertStream provider: ${error.message}`);
        reject(error);
      }
    });
  }
  
  /**
   * Stop the provider
   * @returns {Promise<void>} Promise that resolves when disconnected
   */
  stop() {
    return new Promise((resolve) => {
      try {
        // Clear reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        
        // Check if connected
        if (!this.connected || !this.ws) {
          this.logger.debug('Not connected to CertStream');
          return resolve();
        }
        
        // Close WebSocket
        this.ws.removeAllListeners();
        
        // Update connected time if needed
        if (this.connectTime) {
          this.stats.totalConnectedTime += (Date.now() - this.connectTime);
          this.connectTime = null;
        }
        
        // Close connection
        this.ws.close();
        this.ws = null;
        this.connected = false;
        
        // Update stats
        this.stats.disconnectCount++;
        this.stats.lastDisconnectTime = new Date();
        
        this.logger.debug('Disconnected from CertStream');
        this.emit('disconnected');
        
        resolve();
      } catch (error) {
        this.logger.error(`Error stopping CertStream provider: ${error.message}`);
        this.ws = null;
        this.connected = false;
        resolve();
      }
    });
  }
  
  /**
   * Connect to the WebSocket
   * @private
   * @returns {Promise<void>} Promise that resolves when connected
   */
  _connect() {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket
        this.logger.debug(`Connecting to CertStream at ${this.options.url}`);
        this.ws = new WebSocket(this.options.url);
        
        // Set up event handlers
        this.ws.on('open', () => {
          this.logger.debug('Connected to CertStream');
          this.connected = true;
          this.reconnectAttempts = 0;
          this.connectTime = Date.now();
          
          // Update stats
          this.stats.connectCount++;
          this.stats.lastConnectTime = new Date();
          
          this.emit('connected');
          resolve();
        });
        
        this.ws.on('message', (data) => {
          try {
            // Update stats
            this.stats.messageCount++;
            this.stats.dataReceived += data.length;
            
            // Parse message
            const message = JSON.parse(data);
            
            // Process message
            if (message.message_type === 'heartbeat') {
              this.stats.heartbeatCount++;
              
              if (!this.options.skipHeartbeats) {
                this.emit('heartbeat', message);
              }
            } else if (message.message_type === 'certificate_update') {
              this.stats.certificateCount++;
              this.emit('certificate', message);
            }
          } catch (error) {
            this.logger.error(`Error processing message: ${error.message}`);
          }
        });
        
        this.ws.on('error', (error) => {
          this.logger.error(`WebSocket error: ${error.message}`);
          this.stats.errorCount++;
          this.emit('error', error);
          
          // If not connected yet, reject the promise
          if (!this.connected) {
            reject(error);
          }
        });
        
        this.ws.on('close', () => {
          // Update connected time if needed
          if (this.connectTime) {
            this.stats.totalConnectedTime += (Date.now() - this.connectTime);
            this.connectTime = null;
          }
          
          // Update state
          const wasConnected = this.connected;
          this.connected = false;
          this.ws = null;
          
          // Update stats
          if (wasConnected) {
            this.stats.disconnectCount++;
            this.stats.lastDisconnectTime = new Date();
            this.logger.debug('Disconnected from CertStream');
            this.emit('disconnected');
          }
          
          // Attempt to reconnect
          this._scheduleReconnect();
        });
      } catch (error) {
        this.logger.error(`Error connecting to CertStream: ${error.message}`);
        reject(error);
      }
    });
  }
  
  /**
   * Schedule a reconnect attempt
   * @private
   */
  _scheduleReconnect() {
    // Check if reconnect is allowed
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.logger.error(`Maximum reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
      return;
    }
    
    // Increment reconnect attempts
    this.reconnectAttempts++;
    this.stats.reconnectAttempts++;
    
    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.options.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );
    
    this.logger.debug(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    // Schedule reconnect
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      
      this.logger.debug(`Attempting to reconnect (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
      
      // Attempt to reconnect
      this._connect()
        .catch(error => {
          this.logger.error(`Reconnect failed: ${error.message}`);
        });
    }, delay);
  }
  
  /**
   * Get provider statistics
   * @returns {Object} Provider statistics
   */
  getStats() {
    // Calculate current connected time
    let totalConnectedTime = this.stats.totalConnectedTime;
    
    if (this.connected && this.connectTime) {
      totalConnectedTime += (Date.now() - this.connectTime);
    }
    
    // Format uptime
    const uptimeSeconds = Math.floor(totalConnectedTime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    
    const formattedUptime = uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`
      : uptimeMinutes > 0
        ? `${uptimeMinutes}m ${uptimeSeconds % 60}s`
        : `${uptimeSeconds}s`;
    
    // Return stats
    return {
      connected: this.connected,
      url: this.options.url,
      connectCount: this.stats.connectCount,
      disconnectCount: this.stats.disconnectCount,
      reconnectAttempts: this.stats.reconnectAttempts,
      messages: {
        total: this.stats.messageCount,
        certificates: this.stats.certificateCount,
        heartbeats: this.stats.heartbeatCount
      },
      errorCount: this.stats.errorCount,
      uptime: {
        ms: totalConnectedTime,
        formatted: formattedUptime
      },
      dataReceived: {
        bytes: this.stats.dataReceived,
        formatted: this._formatBytes(this.stats.dataReceived)
      },
      timestamps: {
        lastConnect: this.stats.lastConnectTime,
        lastDisconnect: this.stats.lastDisconnectTime
      }
    };
  }
  
  /**
   * Format bytes to human-readable string
   * @private
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = CertstreamProvider;