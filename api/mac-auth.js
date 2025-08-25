// api/mac-auth.js - Vercel serverless function with persistent storage
import { kv } from '@vercel/kv';

// Configuration
const ADMIN_SECRET_KEYS = ['122316']; // Your admin key(s)
const MAC_DATA_KEY = 'mac_whitelist_v2'; // Key for storing MAC data in Vercel KV

// Helper function to get all MAC addresses from persistent storage
async function getAllMacAddresses() {
    try {
        const macData = await kv.get(MAC_DATA_KEY);
        return macData || {};
    } catch (error) {
        console.error('Error getting MAC data:', error);
        return {};
    }
}

// Helper function to save all MAC addresses to persistent storage
async function saveAllMacAddresses(macData) {
    try {
        await kv.set(MAC_DATA_KEY, macData);
        return true;
    } catch (error) {
        console.error('Error saving MAC data:', error);
        return false;
    }
}

// Helper function to validate admin key
function isValidAdmin(adminKey) {
    return ADMIN_SECRET_KEYS.includes(adminKey);
}

// Helper function to validate MAC address format
function isValidMac(mac) {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).json({});
    }

    const { action } = req.query;
    
    try {
        switch (action) {
            case 'check-access':
                return await handleCheckAccess(req, res);
            case 'add-mac':
                return await handleAddMac(req, res);
            case 'update-access':
                return await handleUpdateAccess(req, res);
            case 'remove-mac':
                return await handleRemoveMac(req, res);
            case 'list-macs':
                return await handleListMacs(req, res);
            case 'bulk-add':
                return await handleBulkAdd(req, res);
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid action'
                });
        }
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

// Handle check-access requests
async function handleCheckAccess(req, res) {
    const { macAddresses, deviceInfo } = req.body;
    
    if (!macAddresses || !Array.isArray(macAddresses)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid MAC addresses provided'
        });
    }
    
    const allMacs = await getAllMacAddresses();
    
    // Check if any of the provided MAC addresses are authorized
    for (const mac of macAddresses) {
        const normalizedMac = mac.toLowerCase();
        if (allMacs[normalizedMac]) {
            const macData = allMacs[normalizedMac];
            
            // Update last seen and access count
            macData.lastSeen = new Date().toISOString();
            macData.accessCount = (macData.accessCount || 0) + 1;
            macData.lastDevice = deviceInfo;
            
            // Save updated data
            allMacs[normalizedMac] = macData;
            await saveAllMacAddresses(allMacs);
            
            return res.status(200).json({
                success: true,
                message: 'Device authorized',
                data: {
                    macAddress: normalizedMac,
                    description: macData.description,
                    accessType: macData.accessType || 'trial', // FIXED: Always return accessType
                    addedAt: macData.addedAt,
                    lastSeen: macData.lastSeen,
                    accessCount: macData.accessCount
                }
            });
        }
    }
    
    return res.status(403).json({
        success: false,
        message: 'Device not authorized. Contact administrator to whitelist your MAC address.',
        data: {
            providedMacs: macAddresses,
            deviceInfo: deviceInfo
        }
    });
}

// Handle add-mac requests
async function handleAddMac(req, res) {
    const { macAddress, description, accessType = 'trial', adminKey } = req.body;
    
    if (!isValidAdmin(adminKey)) {
        return res.status(403).json({
            success: false,
            message: 'Invalid admin key'
        });
    }
    
    if (!macAddress || !isValidMac(macAddress)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid MAC address format'
        });
    }
    
    if (!['trial', 'unlimited', 'admin'].includes(accessType)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid access type. Must be: trial, unlimited, or admin'
        });
    }
    
    const normalizedMac = macAddress.toLowerCase();
    const allMacs = await getAllMacAddresses();
    
    if (allMacs[normalizedMac]) {
        return res.status(409).json({
            success: false,
            message: 'MAC address already exists in whitelist'
        });
    }
    
    // Add new MAC address with all required fields
    allMacs[normalizedMac] = {
        macAddress: normalizedMac,
        description: description || 'No description',
        accessType: accessType, // FIXED: Store the access type
        addedAt: new Date().toISOString(),
        accessCount: 0,
        lastSeen: null,
        lastDevice: null
    };
    
    const saved = await saveAllMacAddresses(allMacs);
    
    if (!saved) {
        return res.status(500).json({
            success: false,
            message: 'Failed to save MAC address to database'
        });
    }
    
    return res.status(200).json({
        success: true,
        message: 'MAC address added successfully',
        data: {
            macAddress: normalizedMac,
            description: description,
            accessType: accessType,
            addedAt: allMacs[normalizedMac].addedAt
        }
    });
}

// Handle update-access requests
async function handleUpdateAccess(req, res) {
    const { macAddress, accessType, adminKey } = req.body;
    
    if (!isValidAdmin(adminKey)) {
        return res.status(403).json({
            success: false,
            message: 'Invalid admin key'
        });
    }
    
    if (!macAddress || !isValidMac(macAddress)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid MAC address format'
        });
    }
    
    if (!['trial', 'unlimited', 'admin'].includes(accessType)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid access type. Must be: trial, unlimited, or admin'
        });
    }
    
    const normalizedMac = macAddress.toLowerCase();
    const allMacs = await getAllMacAddresses();
    
    if (!allMacs[normalizedMac]) {
        return res.status(404).json({
            success: false,
            message: 'MAC address not found in whitelist'
        });
    }
    
    // Update the access type
    allMacs[normalizedMac].accessType = accessType;
    allMacs[normalizedMac].updatedAt = new Date().toISOString();
    
    const saved = await saveAllMacAddresses(allMacs);
    
    if (!saved) {
        return res.status(500).json({
            success: false,
            message: 'Failed to update MAC address in database'
        });
    }
    
    return res.status(200).json({
        success: true,
        message: 'Access type updated successfully',
        data: {
            macAddress: normalizedMac,
            accessType: accessType,
            updatedAt: allMacs[normalizedMac].updatedAt
        }
    });
}

// Handle remove-mac requests
async function handleRemoveMac(req, res) {
    const { macAddress, adminKey } = req.body;
    
    if (!isValidAdmin(adminKey)) {
        return res.status(403).json({
            success: false,
            message: 'Invalid admin key'
        });
    }
    
    if (!macAddress || !isValidMac(macAddress)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid MAC address format'
        });
    }
    
    const normalizedMac = macAddress.toLowerCase();
    const allMacs = await getAllMacAddresses();
    
    if (!allMacs[normalizedMac]) {
        return res.status(404).json({
            success: false,
            message: 'MAC address not found in whitelist'
        });
    }
    
    delete allMacs[normalizedMac];
    
    const saved = await saveAllMacAddresses(allMacs);
    
    if (!saved) {
        return res.status(500).json({
            success: false,
            message: 'Failed to remove MAC address from database'
        });
    }
    
    return res.status(200).json({
        success: true,
        message: 'MAC address removed successfully'
    });
}

// Handle list-macs requests
async function handleListMacs(req, res) {
    const { adminKey } = req.body;
    
    if (!isValidAdmin(adminKey)) {
        return res.status(403).json({
            success: false,
            message: 'Invalid admin key'
        });
    }
    
    const allMacs = await getAllMacAddresses();
    const macList = Object.values(allMacs);
    
    // Calculate statistics
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const statistics = {
        total: macList.length,
        activeLast24h: macList.filter(mac => mac.lastSeen && new Date(mac.lastSeen) > yesterday).length,
        activeLast7d: macList.filter(mac => mac.lastSeen && new Date(mac.lastSeen) > weekAgo).length,
        neverUsed: macList.filter(mac => !mac.lastSeen).length,
        totalAccesses: macList.reduce((sum, mac) => sum + (mac.accessCount || 0), 0),
        byAccessType: {
            trial: macList.filter(mac => (mac.accessType || 'trial') === 'trial').length,
            unlimited: macList.filter(mac => (mac.accessType || 'trial') === 'unlimited').length,
            admin: macList.filter(mac => (mac.accessType || 'trial') === 'admin').length
        }
    };
    
    return res.status(200).json({
        success: true,
        message: 'MAC addresses retrieved successfully',
        data: {
            macAddresses: macList,
            statistics: statistics
        }
    });
}

// Handle bulk-add requests
async function handleBulkAdd(req, res) {
    const { macAddresses, adminKey } = req.body;
    
    if (!isValidAdmin(adminKey)) {
        return res.status(403).json({
            success: false,
            message: 'Invalid admin key'
        });
    }
    
    if (!Array.isArray(macAddresses)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid MAC addresses list'
        });
    }
    
    const allMacs = await getAllMacAddresses();
    const results = [];
    let successCount = 0;
    
    for (const macData of macAddresses) {
        const { macAddress, description, accessType = 'trial' } = macData;
        
        if (!macAddress || !isValidMac(macAddress)) {
            results.push({
                macAddress: macAddress,
                success: false,
                message: 'Invalid MAC address format'
            });
            continue;
        }
        
        const normalizedMac = macAddress.toLowerCase();
        
        if (allMacs[normalizedMac]) {
            results.push({
                macAddress: normalizedMac,
                success: false,
                message: 'Already exists'
            });
            continue;
        }
        
        allMacs[normalizedMac] = {
            macAddress: normalizedMac,
            description: description || 'Bulk added',
            accessType: accessType,
            addedAt: new Date().toISOString(),
            accessCount: 0,
            lastSeen: null,
            lastDevice: null
        };
        
        results.push({
            macAddress: normalizedMac,
            success: true,
            message: 'Added successfully'
        });
        
        successCount++;
    }
    
    const saved = await saveAllMacAddresses(allMacs);
    
    if (!saved) {
        return res.status(500).json({
            success: false,
            message: 'Failed to save MAC addresses to database'
        });
    }
    
    return res.status(200).json({
        success: true,
        message: `Bulk add completed. ${successCount}/${macAddresses.length} addresses added.`,
        data: {
            results: results,
            successCount: successCount,
            totalCount: macAddresses.length
        }
    });
}
