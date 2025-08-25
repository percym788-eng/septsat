// database-config.js - Database Configuration for Different Environments
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment detection
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Database configuration
export const DATABASE_CONFIG = {
    // For Vercel deployment, use /tmp directory (ephemeral but functional)
    // For local development, use project directory
    dataPath: isVercel 
        ? '/tmp/sat-database' 
        : path.join(__dirname, 'data'),
    
    // Backup configuration
    enableBackups: !isVercel, // Disable backups on Vercel (ephemeral filesystem)
    maxBackups: 10,
    
    // Security settings
    encryptDatabase: isProduction,
    encryptionKey: process.env.DATABASE_ENCRYPTION_KEY || 'default-encryption-key-change-me',
    
    // Rate limiting
    rateLimitEnabled: true,
    rateLimitRequests: 60, // requests per hour per IP
    rateLimitWindow: 60 * 60 * 1000, // 1 hour in milliseconds
    
    // Admin settings
    adminKey: process.env.ADMIN_SECRET_KEY || 'default-admin-key-change-me',
    
    // Logging
    enableAccessLogs: true,
    maxLogEntries: isVercel ? 500 : 1000,
    
    // Performance
    cacheEnabled: true,
    cacheTimeout: 5 * 60 * 1000, // 5 minutes
    
    // Environment info
    environment: {
        isVercel,
        isDevelopment,
        isProduction,
        platform: os.platform(),
        nodeVersion: process.version
    }
};

// Vercel-specific configuration
export const VERCEL_CONFIG = {
    // Since Vercel has ephemeral filesystems, we need special handling
    persistentStorage: false,
    
    // Use environment variables for critical data persistence
    fallbackToEnvVars: true,
    
    // Recommended: Use external database for production
    recommendExternalDB: true,
    
    // Temporary file handling
    cleanupOnShutdown: true
};

// Development configuration
export const DEVELOPMENT_CONFIG = {
    enableDebugLogging: true,
    autoBackup: true,
    backupInterval: 30 * 60 * 1000, // 30 minutes
    verboseLogging: true
};

// Export combined configuration
export default {
    ...DATABASE_CONFIG,
    vercel: VERCEL_CONFIG,
    development: DEVELOPMENT_CONFIG
};
