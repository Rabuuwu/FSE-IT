// Shared utility functions for frontend
// This module provides common functions used across multiple pages

/**
 * Escapes HTML special characters to prevent XSS vulnerabilities
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text safe for innerHTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Converts markdown to HTML with safe sanitization
 * @param {string} markdown - Markdown text
 * @returns {string} - HTML string safe for innerHTML
 */
function markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown
        .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
        .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
        .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/___(.*?)___/g, '<em><strong>$1</strong></em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/^```(.*?)\n([\s\S]*?)```/gm, '<pre><code>$2</code></pre>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^- (.*?)$/gm, '<li>$1</li>')
        .replace(/^(\d+)\. (.*?)$/gm, '<li>$2</li>')
        .replace(/(<li>.*<\/li>)/s, (match) => {
            const isOrdered = /^\d+\./.test(match);
            return `<${isOrdered ? 'ol' : 'ul'}>${match}</${isOrdered ? 'ol' : 'ul'}>`;
        })
        .replace(/^\> (.*?)$/gm, '<blockquote>$1</blockquote>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<ol') && 
        !html.startsWith('<pre') && !html.startsWith('<blockquote')) {
        html = '<p>' + html + '</p>';
    }

    return html;
}

/**
 * Shows notification to user
 * @param {string} message - Message text
 * @param {string} type - Type: 'info', 'error', 'success' (default: 'info')
 * @param {number} duration - Duration in ms (default: 3000)
 */
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    if (!notification) {
        console.warn('Notification element not found in DOM');
        return;
    }

    notification.textContent = message;
    notification.className = `notification show ${type}`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

/**
 * Formats date to Polish locale string
 * @param {string|Date} dateStr - Date string or Date object
 * @returns {string} - Formatted date
 */
function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('pl-PL');
}

/**
 * Formats date and time to Polish locale string
 * @param {string|Date} dateStr - Date string or Date object
 * @returns {string} - Formatted date and time
 */
function formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleString('pl-PL');
}

/**
 * Checks if user has valid authentication token
 * @returns {boolean} - True if token exists
 */
function hasAuthToken() {
    return !!localStorage.getItem('token');
}

/**
 * Gets authentication token from localStorage
 * @returns {string|null} - Token string or null
 */
function getAuthToken() {
    return localStorage.getItem('token');
}

/**
 * Removes authentication token from localStorage
 */
function removeAuthToken() {
    localStorage.removeItem('token');
}

/**
 * Makes authenticated fetch request with Bearer token
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options
 * @returns {Promise} - Fetch response
 */
async function fetchWithAuth(url, options = {}) {
    const token = getAuthToken();
    if (!token) {
        throw new Error('No authentication token found');
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
    };

    return fetch(url, { ...options, headers });
}

/**
 * Handles authentication errors (redirects to login)
 * @param {Error} error - Error object
 */
function handleAuthError(error) {
    console.error('Auth error:', error.message);
    removeAuthToken();
    window.location.href = 'login.html';
}
