// api/mac-auth.js - Simple MAC Whitelist API (No Environment Variables)
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action } = req.query;

    try {
        switch (action) {
            case 'check-access':
                return handleCheckAccess(req, res);
            case 'add-mac':
                return handleAddMAC(req, res);
            case 'remove-mac':
                return handleRemoveMAC(req, res);
            case 'list-macs':
                return handleListMACs(req, res);
            case 'ping':
                return handlePing(req, res);
            case 'bulk-add':
                return handleBulkAddMACs(req, res);
            default:
                return res.status(404).json({ success: false, message: 'Endpoint not found' });
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

// Configuration (hardcoded - no environment variables)
const ADMIN_SECRET_KEY = '122316'; // Your secret key
const DATA_FILE = '/tmp/mac-whitelist.json'; // Temporary storage for Vercel

// Simple file-based storage for Vercel
function getWhitelist() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error loading whitelist:', error);
        return [];
    }
}

function saveWhitelist(whitelist) {
    try {
        // Ensure directory exists
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Save main file
        fs.writeFileSync(DATA_FILE, JSON.stringify(whitelist, null, 2));
        
        // Save backup with timestamp
        const backupFile = `/tmp/mac-whitelist-backup-${Date.now()}.json`;
        fs.writeFileSync(backupFile, JSON.stringify(whitelist, null, 2));
        
        console.log(`[${new Date().toISOString()}] Whitelist saved: ${whitelist.length} entries`);
        return true;
    } catch (error) {
        console.error('Error saving whitelist:', error);
        return false;
    }
}

// Log access attempts
function logAccess(macAddresses, deviceInfo, granted, reason = '', req) {
    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            macAddresses,
            deviceInfo,
            granted,
            reason,
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
        };
        
        console.log(`[ACCESS LOG] ${granted ? '✅' : '❌'} ${deviceInfo?.hostname || 'unknown'} | MACs: ${macAddresses.join(',')} | ${reason}`);
        
        // Save to log file
        const logFile = '/tmp/access-logs.json';
        let logs = [];
        
        if (fs.existsSync(logFile)) {
            try {
                logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            } catch (e) {
                logs = [];
            }
        }
        
        logs.push(logEntry);
        
        // Keep only last 500 entries
        if (logs.length > 500) {
            logs = logs.slice(-500);
        }
        
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
        
    } catch (error) {
        console.error('Error logging access:', error);
    }
}

async function handlePing(req, res) {
    return res.status(200).json({
        success: true,
        message: 'MAC Auth Server is running',
        timestamp: new Date().toISOString(),
        adminKey: ADMIN_SECRET_KEY.substring(0, 3) + '***' // Show partial key for verification
    });
}

async function handleCheckAccess(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { macAddresses, deviceInfo } = req.body;

    if (!macAddresses || !Array.isArray(macAddresses) || macAddresses.length === 0) {
        logAccess([], deviceInfo, false, 'No MAC addresses provided', req);
        return res.status(400).json({ 
            success: false, 
            message: 'MAC addresses required' 
        });
    }

    console.log(`[${new Date().toISOString()}] Access check for device: ${deviceInfo?.hostname || 'unknown'}`);
    console.log(`MAC addresses: ${macAddresses.join(', ')}`);

    const whitelist = getWhitelist();
    const normalizedMACs = macAddresses.map(mac => mac.toLowerCase().trim());
    
    // Check if any MAC address is whitelisted
    for (const mac of normalizedMACs) {
        const whitelistEntry = whitelist.find(entry => entry.macAddress === mac);
        
        if (whitelistEntry) {
            // Update last seen and device info
            whitelistEntry.lastSeen = new Date().toISOString();
            whitelistEntry.lastDevice = deviceInfo;
            whitelistEntry.accessCount = (whitelistEntry.accessCount || 0) + 1;
            
            saveWhitelist(whitelist);
            logAccess(macAddresses, deviceInfo, true, `Authorized MAC: ${mac}`, req);
            
            console.log(`✅ Access granted for MAC: ${mac}`);
            
            return res.status(200).json({
                success: true,
                message: 'Device authorized',
                data: {
                    macAddress: mac,
                    description: whitelistEntry.description,
                    addedAt: whitelistEntry.addedAt,
                    lastSeen: whitelistEntry.lastSeen,
                    accessCount: whitelistEntry.accessCount
                }
            });
        }
    }

    logAccess(macAddresses, deviceInfo, false, 'MAC not in whitelist', req);
    console.log(`❌ Access denied for MACs: ${normalizedMACs.join(', ')}`);

    return res.status(403).json({
        success: false,
        message: 'Device not authorized. Contact administrator to add your MAC address to the whitelist.',
        data: {
            submittedMACs: normalizedMACs,
            deviceInfo: {
                hostname: deviceInfo?.hostname,
                platform: deviceInfo?.platform,
                username: deviceInfo?.username
            }
        }
    });
}

async function handleAddMAC(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { macAddress, description, adminKey } = req.body;

    // Validate admin key
    if (adminKey !== ADMIN_SECRET_KEY) {
        console.log(`❌ Invalid admin key attempt from IP: ${req.headers['x-forwarded-for'] || 'unknown'}`);
        logAccess([], null, false, 'Invalid admin key', req);
        return res.status(401).json({ success: false, message: 'Invalid admin key' });
    }

    if (!macAddress) {
        return res.status(400).json({ success: false, message: 'MAC address required' });
    }

    // Validate and normalize MAC address
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    const normalizedMAC = macAddress.toLowerCase().trim();
    
    if (!macRegex.test(normalizedMAC)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid MAC address format. Use xx:xx:xx:xx:xx:xx' 
        });
    }

    const whitelist = getWhitelist();

    // Check if MAC already exists
    if (whitelist.find(entry => entry.macAddress === normalizedMAC)) {
        return res.status(409).json({ 
            success: false, 
            message: 'MAC address already in whitelist' 
        });
    }

    // Add to whitelist
    const newEntry = {
        macAddress: normalizedMAC,
        description: description || 'No description',
        addedAt: new Date().toISOString(),
        addedBy: 'admin',
        lastSeen: null,
        lastDevice: null,
        accessCount: 0
    };

    whitelist.push(newEntry);
    
    const saved = saveWhitelist(whitelist);
    
    if (!saved) {
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to save to database' 
        });
    }

    console.log(`✅ MAC address added: ${normalizedMAC} (${description})`);
    logAccess([normalizedMAC], null, true, 'MAC address added by admin', req);

    return res.status(201).json({
        success: true,
        message: 'MAC address added to whitelist',
        data: newEntry
    });
}

async function handleRemoveMAC(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { macAddress, adminKey } = req.body;

    // Validate admin key
    if (adminKey !== ADMIN_SECRET_KEY) {
        console.log(`❌ Invalid admin key attempt from IP: ${req.headers['x-forwarded-for'] || 'unknown'}`);
        return res.status(401).json({ success: false, message: 'Invalid admin key' });
    }

    if (!macAddress) {
        return res.status(400).json({ success: false, message: 'MAC address required' });
    }

    const whitelist = getWhitelist();
    const normalizedMAC = macAddress.toLowerCase().trim();
    const entryIndex = whitelist.findIndex(entry => entry.macAddress === normalizedMAC);

    if (entryIndex === -1) {
        return res.status(404).json({ 
            success: false, 
            message: 'MAC address not found in whitelist' 
        });
    }

    const removedEntry = whitelist.splice(entryIndex, 1)[0];
    
    const saved = saveWhitelist(whitelist);
    
    if (!saved) {
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to save to database' 
        });
    }

    console.log(`✅ MAC address removed: ${normalizedMAC}`);
    logAccess([normalizedMAC], null, true, 'MAC address removed by admin', req);

    return res.status(200).json({
        success: true,
        message: 'MAC address removed from whitelist',
        data: removedEntry
    });
}

async function handleListMACs(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { adminKey } = req.body;

    // Validate admin key
    if (adminKey !== ADMIN_SECRET_KEY) {
        console.log(`❌ Invalid admin key attempt from IP: ${req.headers['x-forwarded-for'] || 'unknown'}`);
        return res.status(401).json({ success: false, message: 'Invalid admin key' });
    }

    const whitelist = getWhitelist();
    
    // Calculate statistics
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
        total: whitelist.length,
        activeLast24h: whitelist.filter(entry => 
            entry.lastSeen && new Date(entry.lastSeen) > dayAgo
        ).length,
        activeLast7d: whitelist.filter(entry => 
            entry.lastSeen && new Date(entry.lastSeen) > weekAgo
        ).length,
        neverUsed: whitelist.filter(entry => !entry.lastSeen).length,
        totalAccesses: whitelist.reduce((sum, entry) => sum + (entry.accessCount || 0), 0)
    };

    console.log(`📊 Whitelist accessed by admin: ${whitelist.length} entries`);

    return res.status(200).json({
        success: true,
        message: 'MAC whitelist retrieved',
        data: {
            macAddresses: whitelist,
            statistics: stats,
            serverTime: now.toISOString()
        }
    });
}

async function handleBulkAddMACs(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { macAddresses, adminKey } = req.body;

    if (adminKey !== ADMIN_SECRET_KEY) {
        return res.status(401).json({ success: false, message: 'Invalid admin key' });
    }

    if (!macAddresses || !Array.isArray(macAddresses)) {
        return res.status(400).json({ success: false, message: 'MAC addresses array required' });
    }

    const whitelist = getWhitelist();
    const results = [];
    
    for (const macData of macAddresses) {
        const { macAddress, description } = macData;
        const normalizedMAC = macAddress.toLowerCase().trim();
        
        // Validate format
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        if (!macRegex.test(normalizedMAC)) {
            results.push({ 
                macAddress: normalizedMAC, 
                success: false, 
                reason: 'Invalid format' 
            });
            continue;
        }
        
        // Check if already exists
        if (whitelist.find(entry => entry.macAddress === normalizedMAC)) {
            results.push({ 
                macAddress: normalizedMAC, 
                success: false, 
                reason: 'Already exists' 
            });
            continue;
        }
        
        // Add to whitelist
        whitelist.push({
            macAddress: normalizedMAC,
            description: description || 'Bulk added',
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
            lastSeen: null,
            lastDevice: null,
            accessCount: 0
        });
        
        results.push({ 
            macAddress: normalizedMAC, 
            success: true, 
            reason: 'Added successfully' 
        });
    }
    
    saveWhitelist(whitelist);
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Bulk operation: ${successCount}/${macAddresses.length} successful`);
    
    return res.status(200).json({
        success: true,
        message: `Bulk operation completed: ${successCount}/${macAddresses.length} successful`,
        data: {
            results,
            successCount,
            failureCount: macAddresses.length - successCount
        }
    });
}
