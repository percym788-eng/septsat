const MacAuth = require('../auth-mac');
const express = require('express');

// ================================
// Basic Usage Examples
// ================================

async function basicUsage() {
    console.log('=== Basic MAC Authentication Usage ===\n');
    
    // Initialize the authentication system
    const auth = new MacAuth('./database/my_mac_db.json');
    
    // 1. Authorize the current machine
    console.log('1. Authorizing current machine...');
    const authResult = await auth.authorizCurrentMachine({
        description: 'Development machine',
        environment: 'development'
    });
    console.log('Result:', authResult);
    console.log();
    
    // 2. Test authentication
    console.log('2. Testing authentication...');
    const testResult = await auth.authenticateCurrentMachine();
    console.log('Authentication result:', testResult);
    console.log();
    
    // 3. Add a specific MAC address
    console.log('3. Adding specific MAC address...');
    const addResult = await auth.authorizeMacAddress('00:11:22:33:44:55', {
        description: 'Server machine',
        location: 'Data center'
    });
    console.log('Add result:', addResult);
    console.log();
    
    // 4. List all authorized MACs
    console.log('4. Listing authorized MAC addresses...');
    const listResult = await auth.listAuthorizedMacs();
    console.log('Authorized MACs:', listResult);
    console.log();
    
    // 5. Get statistics
    console.log('5. Database statistics...');
    const statsResult = await auth.getAuthStats();
    console.log('Stats:', statsResult);
    console.log();
}

// ================================
// Express.js Middleware Example
// ================================

function expressMiddlewareExample() {
    console.log('=== Express.js Middleware Example ===\n');
    
    const app = express();
    const auth = new MacAuth();
    
    // Use MAC authentication middleware for protected routes
    app.use('/api/protected', auth.authMiddleware());
    
    // Public route (no authentication required)
    app.get('/api/public', (req, res) => {
        res.json({ message: 'This is a public endpoint' });
    });
    
    // Protected route (requires MAC authentication)
    app.get('/api/protected/data', (req, res) => {
        res.json({ 
            message: 'This is protected data',
            macAuth: req.macAuth,
            timestamp: new Date().toISOString()
        });
    });
    
    // Admin route to manage MAC addresses
    app.post('/api/admin/authorize', async (req, res) => {
        const { macAddress, description } = req.body;
        
        if (!macAddress) {
            return res.status(400).json({ error: 'MAC address is required' });
        }
        
        const result = await auth.authorizeMacAddress(macAddress, { description });
        res.json(result);
    });
    
    // Route to get authentication stats
    app.get('/api/admin/stats', async (req, res) => {
        const result = await auth.getAuthStats();
        res.json(result);
    });
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('Try these endpoints:');
        console.log(`  GET http://localhost:${PORT}/api/public`);
        console.log(`  GET http://localhost:${PORT}/api/protected/data`);
        console.log(`  GET http://localhost:${PORT}/api/admin/stats`);
    });
}

// ================================
// Bulk Operations Example
// ================================

async function bulkOperationsExample() {
    console.log('=== Bulk Operations Example ===\n');
    
    const auth = new MacAuth();
    
    // List of MAC addresses to authorize (could come from a file, API, etc.)
    const macList = [
        { address: '00:1a:2b:3c:4d:5e', description: 'Office computer 1' },
        { address: '00:1b:2c:3d:4e:5f', description: 'Office computer 2' },
        { address: '00:1c:2d:3e:4f:60', description: 'Office computer 3' },
        { address: 'aa:bb:cc:dd:ee:ff', description: 'Mobile device' }
    ];
    
    console.log('Bulk authorizing MAC addresses...');
    
    let successful = 0;
    let failed = 0;
    
    for (const mac of macList) {
        const result = await auth.authorizeMacAddress(mac.address, {
            description: mac.description,
            bulkImported: true,
            importDate: new Date().toISOString()
        });
        
        if (result.success) {
            console.log(`✅ Authorized: ${mac.address}`);
            successful++;
        } else {
            console.log(`❌ Failed: ${mac.address} - ${result.message}`);
            failed++;
        }
    }
    
    console.log(`\nBulk operation completed:`);
    console.log(`  Successful: ${successful}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total: ${macList.length}`);
}

// ================================
// Security Monitoring Example
// ================================

async function securityMonitoringExample() {
    console.log('=== Security Monitoring Example ===\n');
    
    const auth = new MacAuth();
    
    // Function to check and log authentication attempts
    async function securityCheck() {
        const result = await auth.authenticateCurrentMachine();
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            macAddress: result.macAddress,
            authenticated: result.authenticated,
            reason: result.reason,
            accessCount: result.accessCount
        };
        
        // Log to console (in real app, might log to file or send to monitoring system)
        console.log('Security Check:', JSON.stringify(logEntry, null, 2));
        
        if (!result.authenticated) {
            console.log('🚨 SECURITY ALERT: Unauthorized access attempt!');
            // Here you could send alerts, emails, etc.
        }
        
        return result;
    }
    
    // Perform security check every 30 seconds
    console.log('Starting security monitoring (Ctrl+C to stop)...');
    const interval = setInterval(securityCheck, 30000);
    
    // Perform initial check
    await securityCheck();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nStopping security monitoring...');
        clearInterval(interval);
        process.exit(0);
    });
}

// ================================
// Custom Database Path Example
// ================================

async function customDatabaseExample() {
    console.log('=== Custom Database Path Example ===\n');
    
    // You can specify different database files for different environments
    const devAuth = new MacAuth('./database/development.json');
    const prodAuth = new MacAuth('./database/production.json');
    const testAuth = new MacAuth('./database/testing.json');
    
    console.log('Setting up development environment...');
    await devAuth.authorizCurrentMachine({ environment: 'development' });
    
    console.log('Setting up production environment...');
    await prodAuth.authorizeMacAddress('00:aa:bb:cc:dd:ee', { environment: 'production' });
    
    // Test authentication against different environments
    const devResult = await devAuth.authenticateCurrentMachine();
    const prodResult = await prodAuth.authenticateCurrentMachine();
    
    console.log('Dev authentication:', devResult.authenticated);
    console.log('Prod authentication:', prodResult.authenticated);
}

// ================================
// Error Handling Example
// ================================

async function errorHandlingExample() {
    console.log('=== Error Handling Example ===\n');
    
    const auth = new MacAuth();
    
    try {
        // Try to authorize an invalid MAC address
        const result = await auth.authorizeMacAddress('invalid-mac-address');
        console.log('Result:', result);
    } catch (error) {
        console.log('Caught error:', error.message);
    }
    
    // Example of handling authentication failures gracefully
    const authResult = await auth.authenticateMacAddress('00:00:00:00:00:00');
    
    if (!authResult.authenticated) {
        console.log('Authentication failed:', authResult.reason);
        
        // You could implement retry logic, logging, alerts, etc.
        switch (authResult.reason) {
            case 'MAC address not found':
                console.log('Suggestion: Add this MAC to the authorized list');
                break;
            case 'MAC address is disabled':
                console.log('Suggestion: Enable this MAC address');
                break;
            case 'Invalid MAC format':
                console.log('Suggestion: Check MAC address format');
                break;
            default:
                console.log('Suggestion: Check system configuration');
        }
    }
}

// ================================
// Run Examples
// ================================

async function runExamples() {
    const args = process.argv.slice(2);
    const example = args[0] || 'basic';
    
    switch (example) {
        case 'basic':
            await basicUsage();
            break;
        case 'express':
            expressMiddlewareExample();
            break;
        case 'bulk':
            await bulkOperationsExample();
            break;
        case 'security':
            await securityMonitoringExample();
            break;
        case 'database':
            await customDatabaseExample();
            break;
        case 'errors':
            await errorHandlingExample();
            break;
        default:
            console.log('Available examples:');
            console.log('  node usage.js basic     - Basic usage examples');
            console.log('  node usage.js express   - Express.js middleware');
            console.log('  node usage.js bulk      - Bulk operations');
            console.log('  node usage.js security  - Security monitoring');
            console.log('  node usage.js database  - Custom database paths');
            console.log('  node usage.js errors    - Error handling');
    }
}

// Export examples for use in other files
module.exports = {
    basicUsage,
    expressMiddlewareExample,
    bulkOperationsExample,
    securityMonitoringExample,
    customDatabaseExample,
    errorHandlingExample
};

// If running directly, execute the specified example
if (require.main === module) {
    runExamples().catch(console.error);
}
