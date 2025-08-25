#!/usr/bin/env node

const MacAuth = require('./auth-mac');
const readline = require('readline');

class MacAdmin {
    constructor() {
        this.auth = new MacAuth();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    // Helper to prompt for user input
    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    // Display main menu
    displayMenu() {
        console.clear();
        console.log('╔══════════════════════════════════════╗');
        console.log('║        MAC Database Admin Tool       ║');
        console.log('╠══════════════════════════════════════╣');
        console.log('║  1. Authorize current machine        ║');
        console.log('║  2. Authorize MAC address            ║');
        console.log('║  3. Remove MAC address               ║');
        console.log('║  4. List authorized MACs             ║');
        console.log('║  5. Enable/Disable MAC               ║');
        console.log('║  6. Test authentication              ║');
        console.log('║  7. View database statistics         ║');
        console.log('║  8. Backup database                  ║');
        console.log('║  9. Import MAC addresses             ║');
        console.log('║  0. Exit                             ║');
        console.log('╚══════════════════════════════════════╝');
    }

    // Format MAC address display
    formatMacDisplay(macAddress, data, index) {
        const status = data.active ? '🟢' : '🔴';
        const lastAccess = data.lastAccess ? 
            new Date(data.lastAccess).toLocaleString() : 
            'Never';
        
        console.log(`${index + 1}. ${status} ${macAddress}`);
        console.log(`   Added: ${new Date(data.added).toLocaleString()}`);
        console.log(`   Last Access: ${lastAccess}`);
        console.log(`   Access Count: ${data.accessCount || 0}`);
        if (data.hostname) console.log(`   Hostname: ${data.hostname}`);
        if (data.platform) console.log(`   Platform: ${data.platform}`);
        console.log();
    }

    // Authorize current machine
    async authorizCurrentMachine() {
        console.log('\n=== Authorize Current Machine ===');
        
        const description = await this.prompt('Enter description (optional): ');
        const metadata = description ? { description } : {};
        
        console.log('Authorizing current machine...');
        const result = await this.auth.authorizCurrentMachine(metadata);
        
        if (result.success) {
            console.log(`✅ Success: ${result.message}`);
            console.log(`MAC Address: ${result.macAddress}`);
        } else {
            console.log(`❌ Error: ${result.error || result.message}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
    }

    // Backup database
    async backupDatabase() {
        console.log('\n=== Backup Database ===');
        
        const customPath = await this.prompt('Enter backup path (or press Enter for default): ');
        const backupPath = customPath.trim() || null;
        
        console.log('Creating backup...');
        const result = await this.auth.backupDatabase(backupPath);
        
        if (result.success) {
            console.log(`✅ Success: Database backed up to ${result.backupPath}`);
        } else {
            console.log(`❌ Error: ${result.error}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
    }

    // Import MAC addresses
    async importMacAddresses() {
        console.log('\n=== Import MAC Addresses ===');
        console.log('Enter MAC addresses separated by commas or newlines:');
        console.log('Format: MAC1, MAC2, MAC3 or one per line');
        console.log('Press Enter twice when done.\n');
        
        let input = '';
        let line;
        while ((line = await this.prompt('')) !== '') {
            input += line + '\n';
        }
        
        if (!input.trim()) {
            console.log('No MAC addresses entered.');
            await this.prompt('Press Enter to continue...');
            return;
        }

        // Parse input
        const macAddresses = input
            .split(/[,\n]/)
            .map(mac => mac.trim())
            .filter(mac => mac.length > 0);

        if (macAddresses.length === 0) {
            console.log('No valid MAC addresses found.');
            await this.prompt('Press Enter to continue...');
            return;
        }

        console.log(`\nFound ${macAddresses.length} MAC address(es) to import:`);
        macAddresses.forEach((mac, i) => console.log(`  ${i + 1}. ${mac}`));
        
        const overwrite = await this.prompt('\nOverwrite existing entries? (y/N): ');
        const shouldOverwrite = overwrite.toLowerCase() === 'y';
        
        console.log('\nImporting MAC addresses...');
        
        // Import addresses one by one for better error handling
        let successful = 0;
        let failed = 0;
        
        for (const macAddress of macAddresses) {
            try {
                const result = shouldOverwrite ? 
                    await this.auth.unauthorizeMacAddress(macAddress).then(() => 
                        this.auth.authorizeMacAddress(macAddress, { imported: true })
                    ) :
                    await this.auth.authorizeMacAddress(macAddress, { imported: true });
                
                if (result.success) {
                    console.log(`  ✅ ${macAddress}`);
                    successful++;
                } else {
                    console.log(`  ❌ ${macAddress} - ${result.message || result.error}`);
                    failed++;
                }
            } catch (error) {
                console.log(`  ❌ ${macAddress} - ${error.message}`);
                failed++;
            }
        }
        
        console.log(`\n📊 Import Summary:`);
        console.log(`   Successful: ${successful}`);
        console.log(`   Failed: ${failed}`);
        console.log(`   Total: ${macAddresses.length}`);
        
        await this.prompt('\nPress Enter to continue...');
    }

    // Main application loop
    async run() {
        console.log('Starting MAC Database Admin Tool...\n');
        
        while (true) {
            this.displayMenu();
            const choice = await this.prompt('\nEnter your choice (0-9): ');
            
            switch (choice.trim()) {
                case '1':
                    await this.authorizCurrentMachine();
                    break;
                case '2':
                    await this.authorizeMacAddress();
                    break;
                case '3':
                    await this.removeMacAddress();
                    break;
                case '4':
                    await this.listAuthorizedMacs();
                    break;
                case '5':
                    await this.toggleMacAddress();
                    break;
                case '6':
                    await this.testAuthentication();
                    break;
                case '7':
                    await this.viewStats();
                    break;
                case '8':
                    await this.backupDatabase();
                    break;
                case '9':
                    await this.importMacAddresses();
                    break;
                case '0':
                    console.log('\nGoodbye! 👋');
                    this.rl.close();
                    process.exit(0);
                    break;
                default:
                    console.log('\n❌ Invalid choice. Please try again.');
                    await this.prompt('Press Enter to continue...');
            }
        }
    }

    // Cleanup
    close() {
        this.rl.close();
    }
}

// Export the class
module.exports = MacAdmin;

// If running directly, start the admin tool
if (require.main === module) {
    const admin = new MacAdmin();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\nShutting down gracefully...');
        admin.close();
        process.exit(0);
    });
    
    // Start the application
    admin.run().catch(error => {
        console.error('Fatal error:', error);
        admin.close();
        process.exit(1);
    });
}

    // Authorize specific MAC address
    async authorizeMacAddress() {
        console.log('\n=== Authorize MAC Address ===');
        
        const macAddress = await this.prompt('Enter MAC address: ');
        if (!macAddress.trim()) {
            console.log('❌ MAC address cannot be empty');
            await this.prompt('Press Enter to continue...');
            return;
        }

        const description = await this.prompt('Enter description (optional): ');
        const metadata = description ? { description } : {};
        
        console.log('Adding MAC address to database...');
        const result = await this.auth.authorizeMacAddress(macAddress, metadata);
        
        if (result.success) {
            console.log(`✅ Success: ${result.message}`);
            console.log(`MAC Address: ${result.macAddress}`);
        } else {
            console.log(`❌ Error: ${result.error || result.message}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
    }

    // Remove MAC address
    async removeMacAddress() {
        console.log('\n=== Remove MAC Address ===');
        
        const macAddress = await this.prompt('Enter MAC address to remove: ');
        if (!macAddress.trim()) {
            console.log('❌ MAC address cannot be empty');
            await this.prompt('Press Enter to continue...');
            return;
        }

        const confirm = await this.prompt(`Are you sure you want to remove ${macAddress}? (y/N): `);
        if (confirm.toLowerCase() !== 'y') {
            console.log('Operation cancelled.');
            await this.prompt('Press Enter to continue...');
            return;
        }
        
        console.log('Removing MAC address...');
        const result = await this.auth.unauthorizeMacAddress(macAddress);
        
        if (result.success) {
            console.log(`✅ Success: ${result.message}`);
        } else {
            console.log(`❌ Error: ${result.error || result.message}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
    }

    // List authorized MAC addresses
    async listAuthorizedMacs() {
        console.log('\n=== Authorized MAC Addresses ===');
        
        const showAll = await this.prompt('Show disabled MACs too? (y/N): ');
        const activeOnly = showAll.toLowerCase() !== 'y';
        
        console.log('\nFetching MAC addresses...\n');
        const result = await this.auth.listAuthorizedMacs(!activeOnly);
        
        if (result.success) {
            if (result.addresses.length === 0) {
                console.log('No MAC addresses found.');
            } else {
                result.addresses.forEach((addr, index) => {
                    this.formatMacDisplay(addr.macAddress, addr, index);
                });
                console.log(`Total: ${result.addresses.length} MAC address(es)`);
            }
        } else {
            console.log(`❌ Error: ${result.error}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
    }

    // Enable/Disable MAC address
    async toggleMacAddress() {
        console.log('\n=== Enable/Disable MAC Address ===');
        
        const macAddress = await this.prompt('Enter MAC address: ');
        if (!macAddress.trim()) {
            console.log('❌ MAC address cannot be empty');
            await this.prompt('Press Enter to continue...');
            return;
        }

        const action = await this.prompt('Enable or Disable? (e/d): ');
        const enable = action.toLowerCase() === 'e';
        
        console.log(`${enable ? 'Enabling' : 'Disabling'} MAC address...`);
        const result = await this.auth.toggleMacAddress(macAddress, enable);
        
        if (result.success) {
            console.log(`✅ Success: ${result.message}`);
        } else {
            console.log(`❌ Error: ${result.error || result.message}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
    }

    // Test authentication
    async testAuthentication() {
        console.log('\n=== Test Authentication ===');
        
        const testType = await this.prompt('Test current machine (c) or specific MAC (s)? ');
        
        let result;
        if (testType.toLowerCase() === 's') {
            const macAddress = await this.prompt('Enter MAC address to test: ');
            result = await this.auth.authenticateMacAddress(macAddress);
            result.macAddress = macAddress;
        } else {
            result = await this.auth.authenticateCurrentMachine();
        }
        
        console.log('\n--- Authentication Result ---');
        console.log(`Status: ${result.authenticated ? '✅ AUTHORIZED' : '❌ UNAUTHORIZED'}`);
        console.log(`MAC Address: ${result.macAddress || 'Unknown'}`);
        console.log(`Reason: ${result.reason || result.error || 'Unknown'}`);
        
        if (result.authenticated) {
            console.log(`Last Access: ${result.lastAccess || 'First access'}`);
            console.log(`Access Count: ${result.accessCount || 0}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
    }

    // View database statistics
    async viewStats() {
        console.log('\n=== Database Statistics ===');
        
        const result = await this.auth.getAuthStats();
        
        if (result.success) {
            const stats = result.stats;
            console.log(`📊 Total MAC Addresses: ${stats.totalAddresses}`);
            console.log(`🟢 Active Addresses: ${stats.activeAddresses}`);
            console.log(`🔴 Inactive Addresses: ${stats.inactiveAddresses}`);
            console.log(`🔑 Total Access Attempts: ${stats.totalAccess}`);
            console.log(`📅 Database Created: ${new Date(stats.databaseCreated).toLocaleString()}`);
            if (stats.lastModified) {
                console.log(`⏰ Last Modified: ${new Date(stats.lastModified).toLocaleString()}`);
            }
            console.log(`🔖 Database Version: ${stats.version}`);
        } else {
            console.log(`❌ Error: ${result.error}`);
        }
        
        await this.prompt('\nPress Enter to continue...');
