// config.js - Configuration file (replace environment variables)
module.exports = {
    // Admin secret key for MAC management
    ADMIN_SECRET_KEY: '122316', // Your secret key
    
    // Server URL (update this when you deploy)
    SERVER_URL: 'https://septsatv1.vercel.app',
    
    // Gemini API Key (if needed)
    GEMINI_API_KEY: 'AIzaSyCsOGWrAgMVM6KAk4hbCb0Dk98aDLvwsv0',
    
    // Database settings
    DATABASE: {
        // For simple file-based storage (no Vercel KV needed)
        USE_FILE_STORAGE: true,
        FILE_PATH: './data/mac-whitelist.json',
        
        // Backup settings
        BACKUP_COUNT: 5,
        AUTO_BACKUP: true
    },
    
    // Security settings
    SECURITY: {
        MAX_LOGIN_ATTEMPTS: 3,
        SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
        LOG_ACCESS_ATTEMPTS: true
    },
    
    // Client settings
    CLIENT: {
        TIMEOUT: 10000, // 10 seconds
        RETRY_ATTEMPTS: 3,
        AUTO_LAUNCH_SAT_HELPER: true
    }
};
