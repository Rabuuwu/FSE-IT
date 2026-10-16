// API Configuration
// Automatically detects the correct API URL based on environment

function getApiUrl() {
    if (window.FSE_API_URL) return window.FSE_API_URL;
    // Check if we're running locally
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' || 
        window.location.hostname === '') {
        return 'http://localhost:3000';
    }
    
    // Production environment - Render URL (no trailing slash)
    return 'https://fse-it.onrender.com';
}

// Export the API base URL
window.API_CONFIG = {
    BASE_URL: getApiUrl(),
    TIMEOUT: 65000, // Allow a sleeping free-tier Core API to start.
    
    // Helper methods
    getEndpoint: function(path) {
        return this.BASE_URL + (path.startsWith('/') ? path : '/' + path);
    }
};
