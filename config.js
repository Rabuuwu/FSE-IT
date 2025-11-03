// API Configuration
// Automatically detects the correct API URL based on environment

function getApiUrl() {
    // Check if we're running locally
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' || 
        window.location.hostname === '') {
        return 'http://localhost:3000';
    }
    
    // Production environment - replace with your actual Render URL
    // You need to update this with your actual Render app URL
    return 'https://fse-it.onrender.com/';
}

// Export the API base URL
window.API_CONFIG = {
    BASE_URL: getApiUrl(),
    TIMEOUT: 10000, // 10 seconds timeout
    
    // Helper methods
    getEndpoint: function(path) {
        return this.BASE_URL + (path.startsWith('/') ? path : '/' + path);
    }
};

console.log('API Configuration loaded:', window.API_CONFIG.BASE_URL);