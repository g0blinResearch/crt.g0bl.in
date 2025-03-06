/**
 * JSON Stream Example
 * 
 * This example creates a real-time stream of Certificate Transparency logs
 * and outputs them in JSON format to the console.
 */

const CTStreamMonitor = require('../src/index');

// Create a simple client that outputs clean JSON data
async function main() {
  // Create the CT stream monitor
  const monitor = new CTStreamMonitor({
    provider: {
      url: 'wss://certstream.calidog.io/',
      skipHeartbeats: true
    },
    cache: {
      enabled: false // Disable cache to reduce memory usage
    },
    autoStart: false
  });

  // Listen for certificates
  monitor.on('certificate', (data) => {
    // Get the certificate and timestamp
    const { certificate, timestamp } = data;
    
    if (!certificate) return;
    
    // Create a clean JSON output
    const output = {
      timestamp,
      commonName: certificate.commonName,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      domains: certificate.domains,
      serialNumber: certificate.serialNumber,
      fingerprint: certificate.fingerprint
    };
    
    // Output as JSON
    console.log(JSON.stringify(output));
  });

  // Handle connection events
  monitor.on('connected', () => {
    console.error('Connected to Certificate Transparency stream');
  });
  
  monitor.on('disconnected', () => {
    console.error('Disconnected from Certificate Transparency stream');
  });
  
  monitor.on('error', (error) => {
    console.error(`Error: ${error.message}`);
  });

  // Initialize and start the monitor
  try {
    await monitor.initialize();
    await monitor.start();
  } catch (error) {
    console.error(`Failed to start monitor: ${error.message}`);
    process.exit(1);
  }

  // Handle termination
  process.on('SIGINT', async () => {
    console.error('\nShutting down...');
    await monitor.shutdown();
    process.exit(0);
  });
}

// Run the example
main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});