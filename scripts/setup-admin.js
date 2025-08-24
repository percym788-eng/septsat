// scripts/setup-admin.js - Initial setup script
#!/usr/bin/env node

const crypto = require('crypto');
const os = require('os');

async function getMacAddresses() {
    try {
        const networkInterfaces = os.networkInterfaces();
        const macAddresses = [];
        
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
                if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
                    macAddresses.push(iface.mac.toLowerCase());
                }
            }
        }
        
        return [...new Set(macAddresses)];
    } catch (error) {
        console.error('Error getting MAC addresses:', error);
        return [];
    }
}

async function setupAdmin() {
    console.log('🔧 SAT Helper MAC Auth - Initial Setup');
    console.log('======================================\n');
    
    // Generate admin secret key
    const adminKey = crypto.randomBytes(32).toString('hex');
    console.log('🔑 Generated Admin Secret Key:');
    console.log(`ADMIN_SECRET_KEY=${adminKey}`);
    console.log('\n⚠️  SAVE THIS KEY SECURELY! You\'ll need it for admin operations.\n');
    
    // Get current device MAC addresses
    const macAddresses = await getMacAddresses();
    const deviceInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        username: os.userInfo().username
    };
    
    console.log('🖥️ Current Device Information:');
    console.log(`   Hostname: ${deviceInfo.hostname}`);
    console.log(`   Platform: ${deviceInfo.platform}`);
    console.log(`   Username: ${deviceInfo.username}`);
    console.log(`   MAC Addresses: ${macAddresses.join(', ')}`);
    
    console.log('\n📋 Environment Variables for Vercel:');
    console.log('====================================');
    console.log(`ADMIN_SECRET_KEY=${adminKey}`);
    console.log('MAC_WHITELIST=[]');
    
    console.log('\n📝 Next Steps:');
    console.log('==============');
    console.log('1. Add the environment variables to your Vercel project');
    console.log('2. Deploy your API to Vercel');
    console.log('3. Update SERVER_URL in sat-launcher-mac.cjs');
    console.log('4. Run: node sat-launcher-mac.cjs admin');
    console.log('5. Add your MAC addresses to the whitelist');
    
    console.log('\n🎯 Your MAC addresses to whitelist:');
    macAddresses.forEach((mac, index) => {
        console.log(`${index + 1}. ${mac} (${deviceInfo.hostname})`);
    });
}

setupAdmin().catch(console.error);

// ================================================================

// scripts/migrate-database.js - Database migration helper
#!/usr/bin/env node

const https = require('https');

// Configuration
const OLD_SERVER_URL = 'https://vercel-updated-app-v1.vercel.app';
const NEW_SERVER_URL = 'https://your-new-vercel-app.vercel.app';

class MigrationHelper {
    async extractUsersToMACs() {
        console.log('🔄 Migration Helper - Extract Users to MAC Whitelist');
        console.log('===================================================\n');
        
        console.log('This script helps you identify devices that should be whitelisted');
        console.log('based on your previous user system.\n');
        
        // Since we can't access the old database directly, provide guidance
        console.log('📋 Manual Migration Steps:');
        console.log('==========================');
        console.log('1. Contact each authorized user');
        console.log('2. Ask them to run this command to get their MAC:');
        console.log('   node -e "console.log(require(\'os\').networkInterfaces())"');
        console.log('3. Extract MAC addresses from the output');
        console.log('4. Add each MAC to the new whitelist system\n');
        
        console.log('🤖 Automated MAC Detection Script for Users:');
        console.log('=============================================');
        console.log(`
// send-this-to-users.js
const os = require('os');

async function getMyMACs() {
    const networkInterfaces = os.networkInterfaces();
    const macAddresses = [];
    
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const iface of interfaces) {
            if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
                macAddresses.push(iface.mac.toLowerCase());
            }
        }
    }
    
    console.log('🖥️ Device:', os.hostname());
    console.log('👤 User:', os.userInfo().username);
    console.log('📱 MAC Addresses:', [...new Set(macAddresses)].join(', '));
    console.log('\\nSend these MAC addresses to the administrator.');
}

getMyMACs();
        `);
        
        console.log('\n📧 Send the script above to authorized users');
        console.log('They run: node send-this-to-users.js');
        console.log('Then send you their MAC addresses to whitelist');
    }
    
    async testConnectivity() {
        console.log('\n🌐 Testing Server Connectivity');
        console.log('==============================\n');
        
        // Test old server
        console.log('Testing old server...');
        try {
            await this.pingServer(OLD_SERVER_URL);
            console.log('✅ Old server reachable');
        } catch (error) {
            console.log('❌ Old server unreachable:', error.message);
        }
        
        // Test new server
        console.log('Testing new server...');
        try {
            await this.pingServer(NEW_SERVER_URL);
            console.log('✅ New server reachable');
        } catch (error) {
            console.log('❌ New server unreachable:', error.message);
        }
    }
    
    async pingServer(url) {
        return new Promise((resolve, reject) => {
            const req = https.request(`${url}/api/mac-auth?action=ping`, (res) => {
                resolve(res.statusCode);
            });
            
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
            req.end();
        });
    }
}

// Run migration helper
const migrationHelper = new MigrationHelper();
migrationHelper.extractUsersToMACs().catch(console.error);
migrationHelper.testConnectivity().catch(console.error);

// ================================================================

// README.md content
const README_CONTENT = `# SAT Helper - MAC Address Authentication`;

console.log('\n📄 README.md Content:');
console.log('====================');
console.log(README_CONTENT);
