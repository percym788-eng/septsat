const MacDatabase = require('./macdb');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MacAuth {
    constructor(dbPath) {
        this.db = new MacDatabase(dbPath);
        this.platform = os.platform();
    }

    // Get MAC address of the current machine
    async getCurrentMacAddress() {
        try {
            const networkInterfaces = os.networkInterfaces();
            
            // Find the first non-internal network interface
            for (const [name, interfaces] of Object.entries(networkInterfaces)) {
                for (const interface of interfaces) {
                    if (!interface.internal && interface.mac && interface.mac !== '00:00:00:00:00:00') {
                        return {
                            success: true,
                            macAddress: interface.mac,
                            interface: name,
                            family: interface.family
                        };
                    }
                }
            }
            
            return { success: false, error: 'No valid MAC address found' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get MAC address using system commands (alternative method)
    async getMacAddressFromSystem() {
        try {
            let command;
            
            switch (this.platform) {
                case 'win32':
                    command = 'getmac /v /fo csv | findstr /V "N/A"';
                    break;
                case 'darwin':
                    command = "ifconfig | grep ether | head -1 | awk '{print $2}'";
                    break;
                case 'linux':
                    command = "ip link show | grep ether | head -1 | awk '{print $2}'";
                    break;
                default:
                    throw new Error('Unsupported platform');
            }

            const { stdout } = await execAsync(command);
            const macAddress = this.extractMacFromOutput(stdout, this.platform);
            
            return {
                success: true,
                macAddress: macAddress,
                method: 'system_command',
                platform: this.platform
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Extract MAC address from system command output
    extractMacFromOutput(output, platform) {
        switch (platform) {
            case 'win32':
                const lines = output.split('\n');
                for (const line of lines) {
                    const match = line.match(/([0-9A-F]{2}-){5}[0-9A-F]{2}/i);
                    if (match) {
                        return match[0].replace(/-/g, ':');
                    }
                }
                break;
            case 'darwin':
            case 'linux':
                const macMatch = output.match(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
                if (macMatch) {
                    return macMatch[0];
                }
                break;
        }
        throw new Error('Could not extract MAC address from system output');
    }

    // Authenticate current machine
    async authenticateCurrentMachine() {
        try {
            // Try to get MAC address using Node.js method first
            let macResult = await this.getCurrentMacAddress();
            
            // If that fails, try system command
            if (!macResult.success) {
                macResult = await this.getMacAddressFromSystem();
            }
            
            if (!macResult.success) {
                return {
                    authenticated: false,
                    error: 'Could not retrieve MAC address',
                    details: macResult.error
                };
            }

            const authResult = await this.db.authenticateMac(macResult.macAddress);
            
            return {
                authenticated: authResult.authenticated,
                macAddress: macResult.macAddress,
                reason: authResult.reason || 'Authentication successful',
                lastAccess: authResult.lastAccess,
                accessCount: authResult.accessCount,
                interface: macResult.interface,
                method: macResult.method || 'nodejs_os'
            };
        } catch (error) {
            return {
                authenticated: false,
                error: 'Authentication process failed',
                details: error.message
            };
        }
    }

    // Authenticate specific MAC address
    async authenticateMacAddress(macAddress) {
        try {
            const result = await this.db.authenticateMac(macAddress);
            return result;
        } catch (error) {
            return {
                authenticated: false,
                error: 'Database error during authentication',
                details: error.message
            };
        }
    }

    // Add current machine to authorized list
    async authorizCurrentMachine(metadata = {}) {
        try {
            const macResult = await this.getCurrentMacAddress();
            
            if (!macResult.success) {
                const systemMacResult = await this.getMacAddressFromSystem();
                if (!systemMacResult.success) {
                    return {
                        success: false,
                        error: 'Could not retrieve MAC address for authorization'
                    };
                }
                macResult.macAddress = systemMacResult.macAddress;
            }

            const authMetadata = {
                hostname: os.hostname(),
                platform: this.platform,
                userInfo: os.userInfo().username,
                authorizedAt: new Date().toISOString(),
                ...metadata
            };

            const result = await this.db.addMacAddress(macResult.macAddress, authMetadata);
            
            return {
                ...result,
                macAddress: macResult.macAddress,
                metadata: authMetadata
            };
        } catch (error) {
            return {
                success: false,
                error: 'Failed to authorize current machine',
                details: error.message
            };
        }
    }

    // Add MAC address to authorized list
    async authorizeMacAddress(macAddress, metadata = {}) {
        try {
            const result = await this.db.addMacAddress(macAddress, {
                authorizedAt: new Date().toISOString(),
                ...metadata
            });
            return result;
        } catch (error) {
            return {
                success: false,
                error: 'Failed to authorize MAC address',
                details: error.message
            };
        }
    }

    // Remove MAC address from authorized list
    async unauthorizeMacAddress(macAddress) {
        try {
            return await this.db.removeMacAddress(macAddress);
        } catch (error) {
            return {
                success: false,
                error: 'Failed to unauthorize MAC address',
                details: error.message
            };
        }
    }

    // List all authorized MAC addresses
    async listAuthorizedMacs(activeOnly = true) {
        try {
            const addresses = await this.db.listMacAddresses(activeOnly);
            return {
                success: true,
                addresses: addresses.map(([mac, data]) => ({
                    macAddress: mac,
                    ...data
                }))
            };
        } catch (error) {
            return {
                success: false,
                error: 'Failed to list authorized MAC addresses',
                details: error.message
            };
        }
    }

    // Get authentication statistics
    async getAuthStats() {
        try {
            const stats = await this.db.getStats();
            return { success: true, stats };
        } catch (error) {
            return {
                success: false,
                error: 'Failed to get authentication statistics',
                details: error.message
            };
        }
    }

    // Enable/Disable MAC address
    async toggleMacAddress(macAddress, enabled = true) {
        try {
            return await this.db.toggleMacAddress(macAddress, enabled);
        } catch (error) {
            return {
                success: false,
                error: `Failed to ${enabled ? 'enable' : 'disable'} MAC address`,
                details: error.message
            };
        }
    }

    // Middleware for Express.js
    authMiddleware() {
        return async (req, res, next) => {
            try {
                const authResult = await this.authenticateCurrentMachine();
                
                if (authResult.authenticated) {
                    req.macAuth = authResult;
                    next();
                } else {
                    res.status(403).json({
                        error: 'MAC Address Authentication Failed',
                        message: authResult.reason || 'Unauthorized MAC address',
                        macAddress: authResult.macAddress
                    });
                }
            } catch (error) {
                res.status(500).json({
                    error: 'Authentication Error',
                    message: 'Internal server error during MAC authentication'
                });
            }
        };
    }

    // CLI-style authentication check
    async quickAuth() {
        const result = await this.authenticateCurrentMachine();
        
        console.log('\n=== MAC Address Authentication ===');
        console.log(`Status: ${result.authenticated ? '✅ AUTHORIZED' : '❌ UNAUTHORIZED'}`);
        console.log(`MAC Address: ${result.macAddress || 'Unknown'}`);
        console.log(`Reason: ${result.reason || result.error}`);
        
        if (result.authenticated) {
            console.log(`Last Access: ${result.lastAccess || 'First access'}`);
            console.log(`Access Count: ${result.accessCount || 0}`);
            console.log(`Interface: ${result.interface || 'Unknown'}`);
        }
        
        console.log('===================================\n');
        
        return result;
    }

    // Backup database
    async backupDatabase(backupPath) {
        try {
            return await this.db.backup(backupPath);
        } catch (error) {
            return {
                success: false,
                error: 'Failed to backup database',
                details: error.message
            };
        }
    }
}

// Export both the class and a default instance
module.exports = MacAuth;
module.exports.MacAuth = MacAuth;

// If running directly, perform a quick authentication check
if (require.main === module) {
    const auth = new MacAuth();
    auth.quickAuth().then(result => {
        process.exit(result.authenticated ? 0 : 1);
    });
}
