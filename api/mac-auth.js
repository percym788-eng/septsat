// api/mac-auth.js - Vercel serverless function with Supabase PostgreSQL
import { createClient } from '@supabase/supabase-js';

// Supabase configuration (from environment variables)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configuration
const ADMIN_SECRET_KEYS = ['122316']; // Your admin key(s)

// Helper function to initialize database table if it doesn't exist
async function initializeDatabase() {
    try {
        // Create table if it doesn't exist
        const { error } = await supabase.rpc('create_mac_table_if_not_exists');
        
        // If RPC doesn't work, try direct SQL (this will only work with service role key)
        if (error) {
            const { error: createError } = await supabase
                .from('mac_whitelist')
                .select('*')
                .limit(1);
            
            // If table doesn't exist, we'll get a specific error
            if (createError && createError.message.includes('relation "mac_whitelist" does not exist')) {
                console.log('Creating mac_whitelist table...');
                // Note: This requires database admin access - we'll handle this in setup
            }
        }
    } catch (error) {
        console.error('Database initialization error:', error);
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

    // Initialize database on first request
    await initializeDatabase();

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
    
    // Check if any of the provided MAC addresses are authorized
    const normalizedMacs = macAddresses.map(mac => mac.toLowerCase());
    
    const { data: macData, error } = await supabase
        .from('mac_whitelist')
        .select('*')
        .in('mac_address', normalizedMacs)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('Database error:', error);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred'
        });
    }
    
    if (macData) {
        // Update last seen and access count
        const { error: updateError } = await supabase
            .from('mac_whitelist')
            .update({
                last_seen: new Date().toISOString(),
                access_count: (macData.access_count || 0) + 1,
                last_device: deviceInfo
            })
            .eq('mac_address', macData.mac_address);
        
        if (updateError) {
            console.error('Update error:', updateError);
        }
        
        return res.status(200).json({
            success: true,
            message: 'Device authorized',
            data: {
                macAddress: macData.mac_address,
                description: macData.description,
                accessType: macData.access_type || 'trial', // FIXED: Always return accessType
                addedAt: macData.added_at,
                lastSeen: new Date().toISOString(),
                accessCount: (macData.access_count || 0) + 1
            }
        });
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
    
    // Check if MAC already exists
    const { data: existing } = await supabase
        .from('mac_whitelist')
        .select('mac_address')
        .eq('mac_address', normalizedMac)
        .single();
    
    if (existing) {
        return res.status(409).json({
            success: false,
            message: 'MAC address already exists in whitelist'
        });
    }
    
    // Insert new MAC address
    const { data, error } = await supabase
        .from('mac_whitelist')
        .insert([
            {
                mac_address: normalizedMac,
                description: description || 'No description',
                access_type: accessType, // FIXED: Store the access type
                added_at: new Date().toISOString(),
                access_count: 0,
                last_seen: null,
                last_device: null
            }
        ])
        .select()
        .single();
    
    if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to save MAC address to database',
            error: error.message
        });
    }
    
    return res.status(200).json({
        success: true,
        message: 'MAC address added successfully',
        data: {
            macAddress: normalizedMac,
            description: description,
            accessType: accessType,
            addedAt: data.added_at
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
    
    const { data, error } = await supabase
        .from('mac_whitelist')
        .update({
            access_type: accessType,
            updated_at: new Date().toISOString()
        })
        .eq('mac_address', normalizedMac)
        .select()
        .single();
    
    if (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({
                success: false,
                message: 'MAC address not found in whitelist'
            });
        }
        
        console.error('Update error:', error);
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
            updatedAt: data.updated_at
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
    
    const { error } = await supabase
        .from('mac_whitelist')
        .delete()
        .eq('mac_address', normalizedMac);
    
    if (error) {
        console.error('Delete error:', error);
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
    
    const { data: macList, error } = await supabase
        .from('mac_whitelist')
        .select('*')
        .order('added_at', { ascending: false });
    
    if (error) {
        console.error('List error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve MAC addresses from database'
        });
    }
    
    // Calculate statistics
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const statistics = {
        total: macList.length,
        activeLast24h: macList.filter(mac => mac.last_seen && new Date(mac.last_seen) > yesterday).length,
        activeLast7d: macList.filter(mac => mac.last_seen && new Date(mac.last_seen) > weekAgo).length,
        neverUsed: macList.filter(mac => !mac.last_seen).length,
        totalAccesses: macList.reduce((sum, mac) => sum + (mac.access_count || 0), 0),
        byAccessType: {
            trial: macList.filter(mac => (mac.access_type || 'trial') === 'trial').length,
            unlimited: macList.filter(mac => (mac.access_type || 'trial') === 'unlimited').length,
            admin: macList.filter(mac => (mac.access_type || 'trial') === 'admin').length
        }
    };
    
    // Convert database format to expected format
    const formattedMacList = macList.map(mac => ({
        macAddress: mac.mac_address,
        description: mac.description,
        accessType: mac.access_type || 'trial',
        addedAt: mac.added_at,
        lastSeen: mac.last_seen,
        accessCount: mac.access_count || 0,
        lastDevice: mac.last_device
    }));
    
    return res.status(200).json({
        success: true,
        message: 'MAC addresses retrieved successfully',
        data: {
            macAddresses: formattedMacList,
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
    
    const results = [];
    const validMacs = [];
    let successCount = 0;
    
    // Validate all MAC addresses first
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
        
        validMacs.push({
            mac_address: normalizedMac,
            description: description || 'Bulk added',
            access_type: accessType,
            added_at: new Date().toISOString(),
            access_count: 0,
            last_seen: null,
            last_device: null
        });
        
        results.push({
            macAddress: normalizedMac,
            success: true,
            message: 'Added successfully'
        });
        
        successCount++;
    }
    
    // Bulk insert valid MAC addresses
    if (validMacs.length > 0) {
        const { error } = await supabase
            .from('mac_whitelist')
            .insert(validMacs);
        
        if (error) {
            console.error('Bulk insert error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to save MAC addresses to database',
                error: error.message
            });
        }
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
