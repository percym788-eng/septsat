// api/mac-auth.js - Simple MAC Address Whitelist API
// Deploy this to your new Vercel repository

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
            default:
                return res.status(404).json({ success: false, message: 'Endpoint not found' });
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

// Configuration - Change these!
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'your-super-secret-admin-key-change-this-immediately';

// MAC Address whitelist storage
// In production, use Vercel KV or a database
let MAC_WHITELIST = JSON.parse(process.env.MAC_WHITELIST || '[]');

// Save MAC whitelist (in production, save to database)
function saveWhitelist() {
    try {
        // For Vercel KV, you'd use something like:
        // await kv.set('mac_whitelist', MAC_WHITELIST);
        
        // For now, we'll use environment variable (temporary)
        process.env.MAC_WHITELIST = JSON.stringify(MAC_WHITELIST);
        console.log(`[${new Date().toISOString()}] Whitelist saved: ${MAC_WHITELIST.length} entries`);
    } catch (error) {
        console.error('Error saving whitelist:', error);
    }
}

// Load MAC whitelist (in production, load from database)
function loadWhitelist() {
    try {
        // For Vercel KV, you'd use something like:
        // MAC_WHITELIST = await kv.get('mac_whitelist') || [];
        
        MAC_WHITELIST = JSON.parse(process.env.MAC_WHITELIST || '[]');
        console.log(`[${new Date().toISOString()}] Whitelist loaded: ${MAC_WHITELIST.length} entries`);
    } catch (error) {
        console.error('Error loading whitelist:', error);
        MAC_WHITELIST = [];
    }
}

// Initialize whitelist on startup
loadWhitelist();

async function handleCheckAccess(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { macAddresses, deviceInfo } = req.body;

    if (!macAddresses || !Array.isArray(macAddresses) || macAddresses.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'MAC addresses required' 
        });
    }

    console.log(`[${new Date().toISOString()}] Access check for device: ${deviceInfo?.hostname || 'unknown'}`);
    console.log(`MAC addresses: ${macAddresses.join(', ')}`);

    // Check if any of the device's MAC addresses are in the whitelist
    const normalizedMACs = macAddresses.map(mac => mac.toLowerCase().trim());
    
    for (const mac of normalizedMACs) {
        const whitelistEntry = MAC_WHITELIST.find(entry => entry.macAddress === mac);
        
        if (whitelistEntry) {
            // Update last seen timestamp
            whitelistEntry.lastSeen = new Date().toISOString();
            whitelistEntry.lastDevice = deviceInfo;
            saveWhitelist();
            
            console.log(`✅ Access granted for MAC: ${mac}`);
            
            return res.status(200).json({
                success: true,
                message: 'Device authorized',
                data: {
                    macAddress: mac,
                    description: whitelistEntry.description,
                    addedAt: whitelistEntry.addedAt,
                    lastSeen: whitelistEntry.lastSeen
                }
            });
        }
    }

    console.log(`❌ Access denied for MACs: ${normalizedMACs.join(', ')}`);

    return res.status(403).json({
        success: false,
        message: 'Device not authorized. Contact administrator to add your MAC address to the whitelist.',
        data: {
            submittedMACs: normalizedMACs,
            whitelistCount: MAC_WHITELIST.length
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
        console.log(`❌ Invalid admin key attempt`);
        return res.status(401).json({ success: false, message: 'Invalid admin key' });
    }

    if (!macAddress) {
        return res.status(400).json({ success: false, message: 'MAC address required' });
    }

    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    const normalizedMAC = macAddress.toLowerCase().trim();
    
    if (!macRegex.test(normalizedMAC)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid MAC address format. Use xx:xx:xx:xx:xx:xx' 
        });
    }

    // Check if MAC already exists
    if (MAC_WHITELIST.find(entry => entry.macAddress === normalizedMAC)) {
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
        lastDevice: null
    };

    MAC_WHITELIST.push(newEntry);
    saveWhitelist();

    console.log(`✅ MAC address added: ${normalizedMAC} (${description})`);

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
        console.log(`❌ Invalid admin key attempt`);
        return res.status(401).json({ success: false, message: 'Invalid admin key' });
    }

    if (!macAddress) {
        return res.status(400).json({ success: false, message: 'MAC address required' });
    }

    const normalizedMAC = macAddress.toLowerCase().trim();
    const entryIndex = MAC_WHITELIST.findIndex(entry => entry.macAddress === normalizedMAC);

    if (entryIndex === -1) {
        return res.status(404).json({ 
            success: false, 
            message: 'MAC address not found in whitelist' 
        });
    }

    const removedEntry = MAC_WHITELIST.splice(entryIndex, 1)[0];
    saveWhitelist();

    console.log(`✅ MAC address removed: ${normalizedMAC}`);

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
        console.log(`❌ Invalid admin key attempt`);
        return res.status(401).json({ success: false, message: 'Invalid admin key' });
    }

    // Return MAC whitelist with statistics
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
        total: MAC_WHITELIST.length,
        activeLast24h: MAC_WHITELIST.filter(entry => 
            entry.lastSeen && new Date(entry.lastSeen) > dayAgo
        ).length,
        activeLast7d: MAC_WHITELIST.filter(entry => 
            entry.lastSeen && new Date(entry.lastSeen) > weekAgo
        ).length,
        neverUsed: MAC_WHITELIST.filter(entry => !entry.lastSeen).length
    };

    console.log(`📊 Whitelist accessed: ${MAC_WHITELIST.length} entries`);

    return res.status(200).json({
        success: true,
        message: 'MAC whitelist retrieved',
        data: {
            macAddresses: MAC_WHITELIST,
            statistics: stats,
            serverTime: now.toISOString()
        }
    });
}
