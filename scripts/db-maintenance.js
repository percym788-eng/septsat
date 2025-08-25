#!/usr/bin/env node

// scripts/db-maintenance.js - Database Maintenance and Utilities
import MACDatabase from '../mac-database.js';
import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseMaintenance {
    constructor() {
        this.macDB = new MACDatabase();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
    
    async question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }
    
    async runMaintenance() {
        console.log('🔧 SAT Database Maintenance Tool');
        console.log('================================');
        
        try {
            const result = await this.macDB.maintenance();
            
            if (result.success) {
                console.log('✅ Maintenance completed successfully!');
                console.log(`📊 Results: ${JSON.stringify(result.data, null, 2)}`);
            } else {
                console.log('❌ Maintenance failed:', result.message);
            }
            
        } catch (error) {
            console.error('❌ Maintenance error:', error);
        }
    }
    
    async exportDatabase() {
        console.log('📤 Exporting database...');
        
        try {
            const result = await this.macDB.listMACAddresses();
            
            if (result.success) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const exportFile = path.join(__dirname, '..', 'exports', `mac-export-${timestamp}.json`);
                
                await fs.ensureDir(path.dirname(exportFile));
                await fs.writeJson(exportFile, result.data, { spaces: 2 });
                
                console.log('✅ Database exported successfully!');
                console.log(`📁 File: ${exportFile}`);
                console.log(`📊 Exported ${result.data.macAddresses.length} MAC addresses`);
                
            } else {
                console.log('❌ Export failed:', result.message);
            }
            
        } catch (error) {
            console.error('❌ Export error:', error);
        }
    }
    
    async importDatabase() {
        console.log('📥 Import database from file...');
        
        const filePath = await this.question('Enter path to import file: ');
        
        if (!await fs.pathExists(filePath)) {
            console.log('❌ File not found:', filePath);
            return;
        }
        
        try {
            const importData = await fs.readJson(filePath);
            
            if (!importData.macAddresses || !Array.isArray(importData.macAddresses)) {
                console.log('❌ Invalid import file format');
                return;
            }
            
            const confirm = await this.question(`Import ${importData.macAddresses.length} MAC addresses? (yes/no): `);
            
            if (confirm.toLowerCase() !== 'yes') {
                console.log('❌ Import cancelled');
                return;
            }
            
            const result = await this.macDB.bulkAddMACs(importData.macAddresses);
            
            if (result.success) {
                console.log('✅ Import completed successfully!');
                console.log(`📊 Added: ${result.data.summary.added}, Skipped: ${result.data.summary.skipped}`);
            } else {
                console.log('❌ Import failed:', result.message);
            }
            
        } catch (error) {
            console.error('❌ Import error:', error);
        }
    }
    
    async showStatistics() {
        console.log('📊 Database Statistics');
        console.log('=====================');
        
        try {
            const result = await this.macDB.listMACAddresses();
            
            if (result.success) {
                const stats = result.data.statistics;
                const macList = result.data.macAddresses;
                
                console.log(`\n📱 Total MAC Addresses: ${stats.total}`);
                console.log(`🟢 Active (24h): ${stats.activeLast24h}`);
                console.log(`🟡 Active (7d): ${stats.activeLast7d}`);
                console.log(`🔴 Never used: ${stats.neverUsed}`);
                console.log(`🎯 Total accesses: ${stats.totalAccesses}`);
                
                console.log('\n🔐 By Access Type:');
                console.log(`  Trial: ${stats.byAccessType.trial}`);
                console.log(`  Unlimited: ${stats.byAccessType.unlimited}`);
                console.log(`  Admin: ${stats.byAccessType.admin}`);
                
                console.log('\n🏆 Most Active Devices:');
                const sortedByAccess = macList
                    .filter(m => m.accessCount > 0)
                    .sort((a, b) => b.accessCount - a.accessCount)
                    .slice(0, 5);
                
                if (sortedByAccess.length > 0) {
                    sortedByAccess.forEach((mac, index) => {
                        console.log(`  ${index + 1}. ${mac.macAddress} - ${mac.accessCount} accesses (${mac.description})`);
                    });
                } else {
                    console.log('  No devices have accessed the system yet');
                }
                
            } else {
                console.log('❌ Failed to get statistics:', result.message);
            }
            
        } catch (error) {
            console.error('❌ Statistics error:', error);
        }
    }
    
    async cleanupUnusedEntries() {
        console.log('🧹 Cleanup unused entries...');
        
        try {
            const result = await this.macDB.listMACAddresses();
            
            if (!result.success) {
                console.log('❌ Failed to get MAC list:', result.message);
                return;
            }
            
            const neverUsed = result.data.macAddresses.filter(mac => !mac.lastSeen);
            
            if (neverUsed.length === 0) {
                console.log('✅ No unused entries found');
                return;
            }
            
            console.log(`\n🔍 Found ${neverUsed.length} unused entries:`);
            neverUsed.forEach(mac => {
                console.log(`  - ${mac.macAddress} (${mac.description}) - Added: ${mac.addedAt}`);
            });
            
            const confirm = await this.question(`\nRemove these ${neverUsed.length} unused entries? (yes/no): `);
            
            if (confirm.toLowerCase() !== 'yes') {
                console.log('❌ Cleanup cancelled');
                return;
            }
            
            let removedCount = 0;
            for (const mac of neverUsed) {
                const removeResult = await this.macDB.removeMACAddress(mac.macAddress);
                if (removeResult.success) {
                    removedCount++;
                }
            }
            
            console.log(`✅ Removed ${removedCount}/${neverUsed.length} unused entries`);
            
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }
    }
    
    async showAccessLogs() {
        console.log('📝 Recent Access Logs');
        console.log('====================');
        
        try {
            const result = await this.macDB.getAccessLogs(20);
            
            if (result.success && result.data.logs.length > 0) {
                console.log(`\n📊 Showing last ${result.data.logs.length} access attempts:\n`);
                
                result.data.logs.forEach(log => {
                    const timestamp = new Date(log.timestamp).toLocaleString();
                    const status = log.success ? '✅' : '❌';
                    const device = log.deviceInfo ? `${log.deviceInfo.hostname} (${log.deviceInfo.username})` : 'Unknown';
                    
                    console.log(`${status} ${timestamp} - ${log.macAddress}`);
                    console.log(`   Device: ${device}`);
                    console.log(`   Message: ${log.message}`);
                    if (log.deviceInfo?.localIP) {
                        console.log(`   IP: ${log.deviceInfo.localIP}`);
                    }
                    console.log('');
                });
                
            } else {
                console.log('📝 No access logs found');
            }
            
        } catch (error) {
            console.error('❌ Logs error:', error);
        }
    }
    
    async interactiveMenu() {
        while (true) {
            console.log('\n🔧 Database Maintenance Menu');
            console.log('============================');
            console.log('1. Run maintenance');
            console.log('2. Show statistics');
            console.log('3. Export database');
            console.log('4. Import database');
            console.log('5. Show access logs');
            console.log('6. Cleanup unused entries');
            console.log('7. Exit');
            
            const choice = await this.question('\nChoose an option (1-7): ');
            
            switch (choice) {
                case '1':
                    await this.runMaintenance();
                    break;
                case '2':
                    await this.showStatistics();
                    break;
                case '3':
                    await this.exportDatabase();
                    break;
                case '4':
                    await this.importDatabase();
                    break;
                case '5':
                    await this.showAccessLogs();
                    break;
                case '6':
                    await this.cleanupUnusedEntries();
                    break;
                case '7':
                    console.log('\n👋 Exiting maintenance tool...');
                    this.rl.close();
                    return;
                default:
                    console.log('❌ Invalid choice');
            }
        }
    }
}

// Command line execution
async function main() {
    const maintenance = new DatabaseMaintenance();
    
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // Interactive menu
        await maintenance.interactiveMenu();
    } else {
        // Command line arguments
        switch (args[0]) {
            case 'maintenance':
            case 'maintain':
                await maintenance.runMaintenance();
                break;
            case 'stats':
            case 'statistics':
                await maintenance.showStatistics();
                break;
            case 'export':
                await maintenance.exportDatabase();
                break;
            case 'import':
                await maintenance.importDatabase();
                break;
            case 'logs':
                await maintenance.showAccessLogs();
                break;
            case 'cleanup':
                await maintenance.cleanupUnusedEntries();
                break;
            default:
                console.log('❌ Unknown command:', args[0]);
                console.log('Available commands: maintenance, stats, export, import, logs, cleanup');
        }
        
        maintenance.rl.close();
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default DatabaseMaintenance;
