const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class MacDatabase {
    constructor(dbPath = './database/mac_addresses.json') {
        this.dbPath = dbPath;
        this.dbDir = path.dirname(dbPath);
        this.lockFile = path.join(this.dbDir, '.lock');
        this.init();
    }

    async init() {
        try {
            // Create database directory if it doesn't exist
            await fs.mkdir(this.dbDir, { recursive: true });
            
            // Check if database file exists, create if not
            try {
                await fs.access(this.dbPath);
            } catch {
                const initialData = {
                    metadata: {
                        created: new Date().toISOString(),
                        version: "1.0.0",
                        totalEntries: 0
                    },
                    macAddresses: {}
                };
                await fs.writeFile(this.dbPath, JSON.stringify(initialData, null, 2));
                console.log('MAC address database initialized at:', this.dbPath);
            }
        } catch (error) {
            console.error('Error initializing database:', error);
            throw error;
        }
    }

    // Generate a unique hash for MAC address (optional security layer)
    generateHash(macAddress) {
        return crypto.createHash('sha256').update(macAddress.toLowerCase()).digest('hex');
    }

    // Normalize MAC address format
    normalizeMac(macAddress) {
        return macAddress.toLowerCase()
            .replace(/[^a-f0-9]/g, '')
            .replace(/(.{2})(?=.)/g, '$1:');
    }

    // Acquire file lock
    async acquireLock(timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                await fs.writeFile(this.lockFile, process.pid.toString(), { flag: 'wx' });
                return true;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        throw new Error('Could not acquire database lock');
    }

    // Release file lock
    async releaseLock() {
        try {
            await fs.unlink(this.lockFile);
        } catch {
            // Lock file might not exist, which is fine
        }
    }

    // Read database with lock
    async readDatabase() {
        await this.acquireLock();
        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading database:', error);
            throw error;
        } finally {
            await this.releaseLock();
        }
    }

    // Write database with lock
    async writeDatabase(data) {
        await this.acquireLock();
        try {
            data.metadata.lastModified = new Date().toISOString();
            data.metadata.totalEntries = Object.keys(data.macAddresses).length;
            await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error writing database:', error);
            throw error;
        } finally {
            await this.releaseLock();
        }
    }

    // Add MAC address to database
    async addMacAddress(macAddress, metadata = {}) {
        const normalizedMac = this.normalizeMac(macAddress);
        
        if (!this.isValidMac(normalizedMac)) {
            throw new Error('Invalid MAC address format');
        }

        const data = await this.readDatabase();
        
        if (data.macAddresses[normalizedMac]) {
            return { success: false, message: 'MAC address already exists' };
        }

        data.macAddresses[normalizedMac] = {
            added: new Date().toISOString(),
            hash: this.generateHash(normalizedMac),
            active: true,
            lastAccess: null,
            accessCount: 0,
            ...metadata
        };

        await this.writeDatabase(data);
        
        return { 
            success: true, 
            message: 'MAC address added successfully',
            macAddress: normalizedMac 
        };
    }

    // Check if MAC address exists and is active
    async authenticateMac(macAddress) {
        const normalizedMac = this.normalizeMac(macAddress);
        
        if (!this.isValidMac(normalizedMac)) {
            return { authenticated: false, reason: 'Invalid MAC format' };
        }

        const data = await this.readDatabase();
        const entry = data.macAddresses[normalizedMac];

        if (!entry) {
            return { authenticated: false, reason: 'MAC address not found' };
        }

        if (!entry.active) {
            return { authenticated: false, reason: 'MAC address is disabled' };
        }

        // Update access statistics
        entry.lastAccess = new Date().toISOString();
        entry.accessCount = (entry.accessCount || 0) + 1;
        await this.writeDatabase(data);

        return { 
            authenticated: true, 
            macAddress: normalizedMac,
            lastAccess: entry.lastAccess,
            accessCount: entry.accessCount
        };
    }

    // Remove MAC address from database
    async removeMacAddress(macAddress) {
        const normalizedMac = this.normalizeMac(macAddress);
        const data = await this.readDatabase();

        if (!data.macAddresses[normalizedMac]) {
            return { success: false, message: 'MAC address not found' };
        }

        delete data.macAddresses[normalizedMac];
        await this.writeDatabase(data);

        return { 
            success: true, 
            message: 'MAC address removed successfully',
            macAddress: normalizedMac 
        };
    }

    // Disable/Enable MAC address
    async toggleMacAddress(macAddress, active = true) {
        const normalizedMac = this.normalizeMac(macAddress);
        const data = await this.readDatabase();

        if (!data.macAddresses[normalizedMac]) {
            return { success: false, message: 'MAC address not found' };
        }

        data.macAddresses[normalizedMac].active = active;
        data.macAddresses[normalizedMac].lastModified = new Date().toISOString();
        await this.writeDatabase(data);

        return { 
            success: true, 
            message: `MAC address ${active ? 'enabled' : 'disabled'} successfully`,
            macAddress: normalizedMac,
            active: active
        };
    }

    // List all MAC addresses
    async listMacAddresses(activeOnly = false) {
        const data = await this.readDatabase();
        const addresses = Object.entries(data.macAddresses);
        
        if (activeOnly) {
            return addresses.filter(([, entry]) => entry.active);
        }
        
        return addresses;
    }

    // Get database statistics
    async getStats() {
        const data = await this.readDatabase();
        const addresses = Object.values(data.macAddresses);
        
        return {
            totalAddresses: addresses.length,
            activeAddresses: addresses.filter(entry => entry.active).length,
            inactiveAddresses: addresses.filter(entry => !entry.active).length,
            totalAccess: addresses.reduce((sum, entry) => sum + (entry.accessCount || 0), 0),
            databaseCreated: data.metadata.created,
            lastModified: data.metadata.lastModified,
            version: data.metadata.version
        };
    }

    // Validate MAC address format
    isValidMac(macAddress) {
        const macRegex = /^([0-9a-f]{2}:){5}([0-9a-f]{2})$/i;
        return macRegex.test(macAddress);
    }

    // Backup database
    async backup(backupPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const finalBackupPath = backupPath || `./database/backup_${timestamp}.json`;
        
        const data = await this.readDatabase();
        await fs.writeFile(finalBackupPath, JSON.stringify(data, null, 2));
        
        return { success: true, backupPath: finalBackupPath };
    }

    // Import MAC addresses from array
    async importMacAddresses(macAddresses, overwrite = false) {
        const results = [];
        
        for (const mac of macAddresses) {
            try {
                const macAddr = typeof mac === 'string' ? mac : mac.address;
                const metadata = typeof mac === 'object' ? { ...mac, address: undefined } : {};
                
                if (overwrite) {
                    await this.removeMacAddress(macAddr);
                }
                
                const result = await this.addMacAddress(macAddr, metadata);
                results.push({ macAddress: macAddr, ...result });
            } catch (error) {
                results.push({ 
                    macAddress: typeof mac === 'string' ? mac : mac.address, 
                    success: false, 
                    message: error.message 
                });
            }
        }
        
        return results;
    }
}

module.exports = MacDatabase;
