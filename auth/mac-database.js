// mac-database.js - Custom File-Based Database for MAC Address Management
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MACDatabase {
    constructor(dbPath = null) {
        // Use provided path or default to data directory
        this.dbPath = dbPath || path.join(__dirname, 'data');
        this.macFile = path.join(this.dbPath, 'mac-whitelist.json');
        this.backupDir = path.join(this.dbPath, 'backups');
        this.logFile = path.join(this.dbPath, 'access-log.json');
        
        // Ensure directories exist
        this.initializeDatabase();
    }
    
    async initializeDatabase() {
        try {
            // Create directories if they don't exist
            await fs.ensureDir(this.dbPath);
            await fs.ensureDir(this.backupDir);
            
            // Initialize MAC whitelist file if it doesn't exist
            if (!await fs.pathExists(this.macFile)) {
                const initialData = {
                    version: '1.0',
                    created: new Date().toISOString(),
                    macAddresses: {},
                    statistics: {
                        totalDevices: 0,
                        totalAccesses: 0,
                        lastUpdated: new Date().toISOString()
                    }
                };
                await fs.writeJson(this.macFile, initialData, { spaces: 2 });
                console.log('🎯 MAC database initialized');
            }
            
            // Initialize access log if it doesn't exist
            if (!await fs.pathExists(this.logFile)) {
                const initialLog = {
                    version: '1.0',
                    created: new Date().toISOString(),
                    accessEvents: []
                };
                await fs.writeJson(this.logFile, initialLog, { spaces: 2 });
                console.log('📝 Access log initialized');
            }
            
        } catch (error) {
            console.error('❌ Error initializing MAC database:', error);
            throw error;
        }
    }
    
    async backupDatabase() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupDir, `mac-whitelist-${timestamp}.json`);
            
            if (await fs.pathExists(this.macFile)) {
                await fs.copy(this.macFile, backupFile);
                console.log(`💾 Database backed up to: ${backupFile}`);
            }
            
            // Clean old backups (keep only last 10)
            const backupFiles = await fs.readdir(this.backupDir);
            const sortedBackups = backupFiles
                .filter(file => file.startsWith('mac-whitelist-') && file.endsWith('.json'))
                .sort()
                .reverse();
            
            if (sortedBackups.length > 10) {
                const filesToDelete = sortedBackups.slice(10);
                for (const file of filesToDelete) {
                    await fs.remove(path.join(this.backupDir, file));
                }
            }
            
        } catch (error) {
            console.error('❌ Error backing up database:', error);
        }
    }
    
    async readDatabase() {
        try {
            const data = await fs.readJson(this.macFile);
            return data;
        } catch (error) {
            console.error('❌ Error reading MAC database:', error);
            // Return default structure if read fails
            return {
                version: '1.0',
                created: new Date().toISOString(),
                macAddresses: {},
                statistics: {
                    totalDevices: 0,
                    totalAccesses: 0,
                    lastUpdated: new Date().toISOString()
                }
            };
        }
    }
    
    async writeDatabase(data) {
        try {
            // Create backup before writing
            await this.backupDatabase();
            
            // Update statistics
            data.statistics.lastUpdated = new Date().toISOString();
            data.statistics.totalDevices = Object.keys(data.macAddresses).length;
            
            // Write to temporary file first, then rename (atomic operation)
            const tempFile = this.macFile + '.tmp';
            await fs.writeJson(tempFile, data, { spaces: 2 });
            await fs.move(tempFile, this.macFile);
            
            console.log('✅ MAC database updated');
            return true;
        } catch (error) {
            console.error('❌ Error writing MAC database:', error);
            return false;
        }
    }
    
    async logAccess(macAddress, deviceInfo, success = true, message = '') {
        try {
            const logData = await fs.pathExists(this.logFile) 
                ? await fs.readJson(this.logFile) 
                : { version: '1.0', created: new Date().toISOString(), accessEvents: [] };
            
            const logEntry = {
                timestamp: new Date().toISOString(),
                macAddress: macAddress,
                deviceInfo: {
                    hostname: deviceInfo.hostname,
                    username: deviceInfo.username,
                    platform: deviceInfo.platform,
                    localIP: deviceInfo.localIP,
                    publicIP: deviceInfo.publicIP,
                    fingerprint: deviceInfo.fingerprint?.substring(0, 16) + '...'
                },
                success: success,
                message: message,
                id: crypto.randomUUID()
            };
            
            logData.accessEvents.push(logEntry);
            
            // Keep only last 1000 log entries
            if (logData.accessEvents.length > 1000) {
                logData.accessEvents = logData.accessEvents.slice(-1000);
            }
            
            await fs.writeJson(this.logFile, logData, { spaces: 2 });
            
        } catch (error) {
            console.error('❌ Error logging access:', error);
        }
    }
    
    // Check if MAC address has access
    async checkAccess(macAddresses, deviceInfo) {
        try {
            const data = await this.readDatabase();
            
            // Check each MAC address
            for (const macAddress of macAddresses) {
                const normalizedMac = macAddress.toLowerCase();
                
                if (data.macAddresses[normalizedMac]) {
                    const entry = data.macAddresses[normalizedMac];
                    
                    // Update last seen and access count
                    entry.lastSeen = new Date().toISOString();
                    entry.accessCount = (entry.accessCount || 0) + 1;
                    entry.lastDevice = {
                        hostname: deviceInfo.hostname,
                        username: deviceInfo.username,
                        platform: deviceInfo.platform,
                        localIP: deviceInfo.localIP,
                        publicIP: deviceInfo.publicIP
                    };
                    
                    // Update total access count in statistics
                    data.statistics.totalAccesses = (data.statistics.totalAccesses || 0) + 1;
                    
                    // Save updated data
                    await this.writeDatabase(data);
                    
                    // Log successful access
                    await this.logAccess(normalizedMac, deviceInfo, true, 'Access granted');
                    
                    return {
                        success: true,
                        message: 'Device authorized',
                        data: {
                            macAddress: normalizedMac,
                            description: entry.description,
                            accessType: entry.accessType || 'trial',
                            addedAt: entry.addedAt,
                            lastSeen: entry.lastSeen,
                            accessCount: entry.accessCount
                        }
                    };
                }
            }
            
            // No matching MAC address found
            await this.logAccess(macAddresses[0] || 'unknown', deviceInfo, false, 'MAC address not whitelisted');
            
            return {
                success: false,
                message: 'Device not authorized. MAC address not in whitelist.',
                data: null
            };
            
        } catch (error) {
            console.error('❌ Error checking MAC access:', error);
            await this.logAccess(macAddresses[0] || 'unknown', deviceInfo, false, `Database error: ${error.message}`);
            
            return {
                success: false,
                message: 'Database error occurred',
                data: null
            };
        }
    }
    
    // Add MAC address to whitelist
    async addMACAddress(macAddress, description, accessType = 'trial') {
        try {
            const normalizedMac = macAddress.toLowerCase();
            const data = await this.readDatabase();
            
            // Check if MAC already exists
            if (data.macAddresses[normalizedMac]) {
                return {
                    success: false,
                    message: 'MAC address already exists in whitelist'
                };
            }
            
            // Add new MAC address
            data.macAddresses[normalizedMac] = {
                description: description,
                accessType: accessType,
                addedAt: new Date().toISOString(),
                lastSeen: null,
                accessCount: 0,
                lastDevice: null,
                id: crypto.randomUUID()
            };
            
            const success = await this.writeDatabase(data);
            
            if (success) {
                console.log(`✅ Added MAC address: ${normalizedMac} (${accessType})`);
                return {
                    success: true,
                    message: 'MAC address added successfully',
                    data: data.macAddresses[normalizedMac]
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to save to database'
                };
            }
            
        } catch (error) {
            console.error('❌ Error adding MAC address:', error);
            return {
                success: false,
                message: `Error adding MAC address: ${error.message}`
            };
        }
    }
    
    // Update access type for existing MAC
    async updateMACAccess(macAddress, accessType) {
        try {
            const normalizedMac = macAddress.toLowerCase();
            const data = await this.readDatabase();
            
            if (!data.macAddresses[normalizedMac]) {
                return {
                    success: false,
                    message: 'MAC address not found in whitelist'
                };
            }
            
            data.macAddresses[normalizedMac].accessType = accessType;
            data.macAddresses[normalizedMac].updatedAt = new Date().toISOString();
            
            const success = await this.writeDatabase(data);
            
            if (success) {
                console.log(`✅ Updated MAC access: ${normalizedMac} -> ${accessType}`);
                return {
                    success: true,
                    message: 'Access type updated successfully',
                    data: data.macAddresses[normalizedMac]
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to save to database'
                };
            }
            
        } catch (error) {
            console.error('❌ Error updating MAC access:', error);
            return {
                success: false,
                message: `Error updating MAC access: ${error.message}`
            };
        }
    }
    
    // Remove MAC address from whitelist
    async removeMACAddress(macAddress) {
        try {
            const normalizedMac = macAddress.toLowerCase();
            const data = await this.readDatabase();
            
            if (!data.macAddresses[normalizedMac]) {
                return {
                    success: false,
                    message: 'MAC address not found in whitelist'
                };
            }
            
            delete data.macAddresses[normalizedMac];
            
            const success = await this.writeDatabase(data);
            
            if (success) {
                console.log(`✅ Removed MAC address: ${normalizedMac}`);
                return {
                    success: true,
                    message: 'MAC address removed successfully'
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to save to database'
                };
            }
            
        } catch (error) {
            console.error('❌ Error removing MAC address:', error);
            return {
                success: false,
                message: `Error removing MAC address: ${error.message}`
            };
        }
    }
    
    // List all MAC addresses with statistics
    async listMACAddresses() {
        try {
            const data = await this.readDatabase();
            const now = new Date();
            const day24h = 24 * 60 * 60 * 1000;
            const day7d = 7 * day24h;
            
            // Convert to array and add computed fields
            const macList = Object.entries(data.macAddresses).map(([mac, entry]) => {
                return {
                    macAddress: mac,
                    description: entry.description,
                    accessType: entry.accessType || 'trial',
                    addedAt: entry.addedAt,
                    lastSeen: entry.lastSeen,
                    accessCount: entry.accessCount || 0,
                    lastDevice: entry.lastDevice,
                    id: entry.id
                };
            });
            
            // Calculate statistics
            const statistics = {
                total: macList.length,
                activeLast24h: macList.filter(entry => {
                    if (!entry.lastSeen) return false;
                    const lastSeen = new Date(entry.lastSeen);
                    return (now - lastSeen) <= day24h;
                }).length,
                activeLast7d: macList.filter(entry => {
                    if (!entry.lastSeen) return false;
                    const lastSeen = new Date(entry.lastSeen);
                    return (now - lastSeen) <= day7d;
                }).length,
                neverUsed: macList.filter(entry => !entry.lastSeen).length,
                totalAccesses: data.statistics.totalAccesses || 0,
                byAccessType: {
                    trial: macList.filter(e => (e.accessType || 'trial') === 'trial').length,
                    unlimited: macList.filter(e => e.accessType === 'unlimited').length,
                    admin: macList.filter(e => e.accessType === 'admin').length
                }
            };
            
            return {
                success: true,
                message: 'MAC addresses retrieved successfully',
                data: {
                    macAddresses: macList,
                    statistics: statistics
                }
            };
            
        } catch (error) {
            console.error('❌ Error listing MAC addresses:', error);
            return {
                success: false,
                message: `Error retrieving MAC addresses: ${error.message}`,
                data: null
            };
        }
    }
    
    // Bulk add MAC addresses
    async bulkAddMACs(macAddressList) {
        try {
            const data = await this.readDatabase();
            const results = [];
            let addedCount = 0;
            let skippedCount = 0;
            
            for (const macEntry of macAddressList) {
                const normalizedMac = macEntry.macAddress.toLowerCase();
                
                if (data.macAddresses[normalizedMac]) {
                    results.push({
                        macAddress: normalizedMac,
                        status: 'skipped',
                        reason: 'Already exists'
                    });
                    skippedCount++;
                } else {
                    data.macAddresses[normalizedMac] = {
                        description: macEntry.description || 'Bulk added device',
                        accessType: macEntry.accessType || 'trial',
                        addedAt: new Date().toISOString(),
                        lastSeen: null,
                        accessCount: 0,
                        lastDevice: null,
                        id: crypto.randomUUID()
                    };
                    
                    results.push({
                        macAddress: normalizedMac,
                        status: 'added',
                        accessType: macEntry.accessType || 'trial'
                    });
                    addedCount++;
                }
            }
            
            const success = await this.writeDatabase(data);
            
            if (success) {
                console.log(`✅ Bulk operation completed: ${addedCount} added, ${skippedCount} skipped`);
                return {
                    success: true,
                    message: `Bulk operation completed: ${addedCount} added, ${skippedCount} skipped`,
                    data: {
                        results: results,
                        summary: {
                            total: macAddressList.length,
                            added: addedCount,
                            skipped: skippedCount
                        }
                    }
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to save bulk changes to database'
                };
            }
            
        } catch (error) {
            console.error('❌ Error in bulk add operation:', error);
            return {
                success: false,
                message: `Bulk add error: ${error.message}`
            };
        }
    }
    
    // Get access logs
    async getAccessLogs(limit = 100) {
        try {
            const logData = await fs.pathExists(this.logFile) 
                ? await fs.readJson(this.logFile) 
                : { accessEvents: [] };
            
            const logs = logData.accessEvents
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
            
            return {
                success: true,
                message: 'Access logs retrieved successfully',
                data: {
                    logs: logs,
                    totalEvents: logData.accessEvents.length
                }
            };
            
        } catch (error) {
            console.error('❌ Error getting access logs:', error);
            return {
                success: false,
                message: `Error retrieving logs: ${error.message}`,
                data: null
            };
        }
    }
    
    // Database maintenance and cleanup
    async maintenance() {
        try {
            console.log('🔧 Starting database maintenance...');
            
            // Create backup
            await this.backupDatabase();
            
            // Cleanup old log entries (keep only last 1000)
            if (await fs.pathExists(this.logFile)) {
                const logData = await fs.readJson(this.logFile);
                if (logData.accessEvents.length > 1000) {
                    logData.accessEvents = logData.accessEvents.slice(-1000);
                    await fs.writeJson(this.logFile, logData, { spaces: 2 });
                    console.log('✅ Cleaned up old log entries');
                }
            }
            
            // Verify database integrity
            const data = await this.readDatabase();
            let fixedCount = 0;
            
            Object.entries(data.macAddresses).forEach(([mac, entry]) => {
                if (!entry.id) {
                    entry.id = crypto.randomUUID();
                    fixedCount++;
                }
                if (!entry.accessType) {
                    entry.accessType = 'trial';
                    fixedCount++;
                }
            });
            
            if (fixedCount > 0) {
                await this.writeDatabase(data);
                console.log(`✅ Fixed ${fixedCount} database entries`);
            }
            
            console.log('✅ Database maintenance completed');
            
            return {
                success: true,
                message: 'Maintenance completed successfully',
                data: {
                    backupsCreated: 1,
                    entriesFixed: fixedCount
                }
            };
            
        } catch (error) {
            console.error('❌ Error during database maintenance:', error);
            return {
                success: false,
                message: `Maintenance error: ${error.message}`
            };
        }
    }
}

// Export the database class
export default MACDatabase;
