// Shared rendering and networking. Raw HTML from educational content is never accepted.
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function safeHttpsUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function markdownToHtml(value) {
    // A deliberately small Markdown subset. Escape before inserting our own fixed markup.
    let code = false;
    return String(value ?? '').split('\n').map(line => {
        if (/^```/.test(line)) { code = !code; return code ? '<pre><code>' : '</code></pre>'; }
        if (code) return escapeHtml(line) + '\n';
        let rendered = escapeHtml(line).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
        const heading = /^(#{1,3})\s+(.*)$/.exec(rendered);
        if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
        return `<p>${rendered || '<br>'}</p>`;
    }).join('\n') + (code ? '</code></pre>' : '');
}
function hasAuthToken() { return !!localStorage.getItem('token'); }
function getAuthToken() { return localStorage.getItem('token'); }
function removeAuthToken() { localStorage.removeItem('token'); }
async function api(path, options = {}) {
    const headers = { ...options.headers };
    if (getAuthToken()) headers.Authorization = `Bearer ${getAuthToken()}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
        response = await fetch(window.API_CONFIG.getEndpoint(path), { ...options, headers, signal: options.signal || AbortSignal.timeout(window.API_CONFIG.TIMEOUT) });
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error('Nie udało się połączyć z serwerem. Może się uruchamiać — spróbuj ponownie.');
    }
    if (response.status === 401 && !['/login','/register'].includes(path)) {
        removeAuthToken(); window.location.assign('login.html');
        throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    }
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Błąd serwera (${response.status}). Spróbuj ponownie.`);
    return data;
}
