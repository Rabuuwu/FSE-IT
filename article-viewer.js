// Article Viewer JavaScript
const API_BASE = window.API_CONFIG.BASE_URL;
let currentUser = null;
let allArticles = [];
let allCourses = [];
let filteredContent = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadContent();
    setupEventListeners();
});

// Check authentication
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Unauthorized');
        }

        const data = await response.json();
        currentUser = data.user;
        document.getElementById('userEmail').textContent = currentUser.email;
    } catch (err) {
        console.error('Auth error:', err);
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

// Load articles and courses
async function loadContent() {
    const token = localStorage.getItem('token');

    try {
        // Load articles
        const articlesRes = await fetch(`${API_BASE}/articles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (articlesRes.ok) {
            allArticles = await articlesRes.json();
        }

        // Load courses
        const coursesRes = await fetch(`${API_BASE}/courses`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (coursesRes.ok) {
            allCourses = await coursesRes.json();
        }

        filterAndDisplayContent();
        updateCounters();
    } catch (err) {
        console.error('Load content error:', err);
        showNotification('Błąd podczas ładowania materiałów', 'error');
    }
}

// Filter and display content
function filterAndDisplayContent() {
    const typeFilter = document.querySelector('input[name="type"]:checked').value;
    const sortBy = document.getElementById('sortSelect').value;
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();

    let content = [];

    // Filter by type
    if (typeFilter === 'all' || typeFilter === 'article') {
        content = content.concat(allArticles.map(a => ({ ...a, contentType: 'article' })));
    }
    if (typeFilter === 'all' || typeFilter === 'course') {
        content = content.concat(allCourses.map(c => ({ ...c, contentType: 'course' })));
    }

    // Filter by search
    if (searchQuery) {
        content = content.filter(item =>
            item.title.toLowerCase().includes(searchQuery) ||
            (item.summary && item.summary.toLowerCase().includes(searchQuery)) ||
            (item.description && item.description.toLowerCase().includes(searchQuery)) ||
            (item.author_email && item.author_email.toLowerCase().includes(searchQuery))
        );
    }

    // Sort
    switch (sortBy) {
        case 'oldest':
            content.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'title-az':
            content.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'title-za':
            content.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'newest':
        default:
            content.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    filteredContent = content;
    displayContent();
}

// Display content
function displayContent() {
    const container = document.getElementById('contentList');

    if (filteredContent.length === 0) {
        container.innerHTML = `
            <div class="no-content" style="grid-column: 1 / -1;">
                <h2>Brak materiałów</h2>
                <p>Nie znaleźliśmy żadnych materiałów spełniających Twoje kryteria.</p>
                <a href="article-creator.html" class="btn btn-primary">Utwórz materiał</a>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredContent.map((item, idx) => {
        const isArticle = item.contentType === 'article';
        const icon = isArticle ? '📝' : '📚';
        const typeLabel = isArticle ? 'Artykuł' : 'Kurs';
        const preview = isArticle
            ? (item.summary || item.content?.substring(0, 150) || 'Brak opisu')
            : item.description || 'Brak opisu';

        return `
            <div class="content-card">
                <div class="content-card-header">
                    <div class="content-type ${item.contentType}">${icon} ${typeLabel}</div>
                    <h3 class="content-title">${escapeHtml(item.title)}</h3>
                    <p class="content-summary">${escapeHtml(preview.substring(0, 100))}</p>
                </div>

                <div class="content-card-body">
                    <div class="content-meta">
                        <div class="meta-item">
                            <span class="meta-label">Autor:</span>
                            <span>${escapeHtml(item.author_email || 'Nieznany')}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Data:</span>
                            <span>${new Date(item.created_at).toLocaleDateString('pl-PL')}</span>
                        </div>
                        ${!isArticle ? `
                            <div class="meta-item">
                                <span class="meta-label">Etapów:</span>
                                <span>${item.stages?.length || 0}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="content-preview">
                        ${escapeHtml(preview.substring(0, 200))}${preview.length > 200 ? '...' : ''}
                    </div>
                </div>

                <div class="content-card-footer">
                    <button class="btn btn-primary" onclick="view${isArticle ? 'Article' : 'Course'}(${item.id})">
                        Czytaj ${isArticle ? 'Artykuł' : 'Kurs'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// View article
async function viewArticle(articleId) {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_BASE}/articles/${articleId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load article');

        const article = await response.json();

        const htmlContent = `
            <div class="article-metadata">
                <div class="metadata-item">
                    <span class="metadata-label">Autor</span>
                    <span class="metadata-value">${escapeHtml(article.author_email || 'Nieznany')}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Data</span>
                    <span class="metadata-value">${new Date(article.created_at).toLocaleDateString('pl-PL')}</span>
                </div>
            </div>

            <h1>${escapeHtml(article.title)}</h1>
            ${article.summary ? `<p style="font-style: italic; color: #7f8c8d; margin-bottom: 20px;">${escapeHtml(article.summary)}</p>` : ''}

            <div class="viewer-content">
                ${markdownToHtml(article.content)}
            </div>
        `;

        document.getElementById('articleViewerContent').innerHTML = htmlContent;
        document.getElementById('articleViewerModal').classList.add('active');
    } catch (err) {
        console.error('View article error:', err);
        showNotification('Błąd podczas ładowania artykułu', 'error');
    }
}

// View course
async function viewCourse(courseId) {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_BASE}/courses/${courseId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load course');

        const course = await response.json();

        const stagesHtml = (course.stages || []).map((stage, idx) => `
            <div class="course-stage">
                <h3>Etap ${idx + 1}: ${escapeHtml(stage.title)}</h3>
                ${markdownToHtml(stage.content)}
            </div>
        `).join('');

        const htmlContent = `
            <div class="article-metadata">
                <div class="metadata-item">
                    <span class="metadata-label">Autor</span>
                    <span class="metadata-value">${escapeHtml(course.author_email || 'Nieznany')}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Etapów</span>
                    <span class="metadata-value">${course.stages?.length || 0}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Data</span>
                    <span class="metadata-value">${new Date(course.created_at).toLocaleDateString('pl-PL')}</span>
                </div>
            </div>

            <h1>${escapeHtml(course.title)}</h1>
            ${course.description ? `<p>${escapeHtml(course.description)}</p>` : ''}

            <hr style="margin: 30px 0; border: none; border-top: 2px solid #bdc3c7;">

            <div class="viewer-content">
                ${stagesHtml}
            </div>
        `;

        document.getElementById('courseViewerContent').innerHTML = htmlContent;
        document.getElementById('courseViewerModal').classList.add('active');
    } catch (err) {
        console.error('View course error:', err);
        showNotification('Błąd podczas ładowania kursu', 'error');
    }
}

// Update counters
function updateCounters() {
    const allCount = allArticles.length + allCourses.length;
    document.getElementById('contentCount').textContent = `${allCount} materiałów`;
    const allCountEl = document.getElementById('allCount');
    const articleCountEl = document.getElementById('articleCount');
    const courseCountEl = document.getElementById('courseCount');

    if (allCountEl) allCountEl.textContent = allCount;
    if (articleCountEl) articleCountEl.textContent = allArticles.length;
    if (courseCountEl) courseCountEl.textContent = allCourses.length;
}

// Setup event listeners
function setupEventListeners() {
    // Filter by type
    document.querySelectorAll('input[name="type"]').forEach(input => {
        input.addEventListener('change', filterAndDisplayContent);
    });

    // Sort
    document.getElementById('sortSelect')?.addEventListener('change', filterAndDisplayContent);

    // Search
    document.getElementById('searchInput')?.addEventListener('input', filterAndDisplayContent);

    // Close modals
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Czy na pewno chcesz się wylogować?')) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
    });
}

// Utility functions
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

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}
