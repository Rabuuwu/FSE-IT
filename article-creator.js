// Article Creator JavaScript
const API_BASE = window.API_CONFIG.BASE_URL;
let currentUser = null;
let editor = null;
let stageEditor = null;
let courseStages = [];
let currentEditingStageIndex = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initializeEditors();
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
        document.getElementById('userEmail').textContent = `👤 ${currentUser.email}`;
    } catch (err) {
        console.error('Auth error:', err);
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

// Initialize SimpleMDE editors
function initializeEditors() {
    // Article editor
    editor = new SimpleMDE({
        element: document.getElementById('articleEditor'),
        spellChecker: false,
        autoDownloadFontAwesome: false,
        toolbar: [
            'bold', 'italic', 'heading', '|',
            'quote', 'unordered-list', 'ordered-list', '|',
            'link', 'image', 'code', '|',
            'preview', 'side-by-side', 'fullscreen', '|',
            'guide'
        ],
        placeholder: 'Napisz zawartość artykułu w Markdownie...'
    });

    // Stage editor
    stageEditor = new SimpleMDE({
        element: document.getElementById('stageEditor'),
        spellChecker: false,
        autoDownloadFontAwesome: false,
        toolbar: [
            'bold', 'italic', 'heading', '|',
            'quote', 'unordered-list', 'ordered-list', '|',
            'link', 'image', 'code', '|',
            'preview', 'side-by-side', 'fullscreen', '|',
            'guide'
        ],
        placeholder: 'Zawartość etapu kursu...'
    });
}

// Setup event listeners
function setupEventListeners() {
    // Mode switching
    document.querySelectorAll('.nav-link[data-mode]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchMode(link.dataset.mode);
        });
    });

    // Article buttons
    document.getElementById('saveArticleBtn')?.addEventListener('click', saveArticle);
    document.getElementById('previewArticleBtn')?.addEventListener('click', previewArticle);
    document.getElementById('exportArticleBtn')?.addEventListener('click', exportArticle);
    document.getElementById('importFileBtn')?.addEventListener('click', importFile);
    document.getElementById('cancelArticleBtn')?.addEventListener('click', resetArticleForm);
    document.getElementById('backArticleBtn')?.addEventListener('click', goToDashboard);

    // Course buttons
    document.getElementById('saveCourseBtn')?.addEventListener('click', saveCourse);
    document.getElementById('previewCourseBtn')?.addEventListener('click', previewCourse);
    document.getElementById('addStageBtn')?.addEventListener('click', addCourseStage);
    document.getElementById('cancelCourseBtn')?.addEventListener('click', resetCourseForm);
    document.getElementById('backCourseBtn')?.addEventListener('click', goToDashboard);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // File input
    document.getElementById('fileInput')?.addEventListener('change', handleFileImport);

    // Modal close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    // Modal stage edit
    document.getElementById('closeStageEditBtn')?.addEventListener('click', closeModals);
    document.getElementById('saveStageBtn')?.addEventListener('click', saveStage);

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModals();
        });
    });
}

// Switch mode between article and course
function switchMode(mode) {
    // Update nav links
    document.querySelectorAll('.nav-link[data-mode]').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

    // Update sections
    document.querySelectorAll('.creator-mode').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${mode}Mode`).classList.add('active');

    // Refresh editors
    setTimeout(() => {
        if (editor) editor.codemirror.refresh();
        if (stageEditor) stageEditor.codemirror.refresh();
    }, 100);
}

// Save article
async function saveArticle() {
    const token = localStorage.getItem('token');
    const title = document.getElementById('articleTitle').value.trim();
    const content = editor.value();
    const summary = document.getElementById('articleSummary').value.trim();
    const published = document.getElementById('publishArticle').checked;

    if (!title) {
        showNotification('Proszę wpisać tytuł artykułu', 'error');
        return;
    }

    if (!content) {
        showNotification('Proszę wpisać zawartość artykułu', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/articles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title,
                content,
                summary,
                published
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save article');
        }

        const data = await response.json();
        showNotification('Artykuł został opublikowany!', 'success');

        // Reset form
        document.getElementById('articleTitle').value = '';
        document.getElementById('articleSummary').value = '';
        editor.value('');
        document.getElementById('publishArticle').checked = true;

        // Redirect to articles view
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    } catch (err) {
        console.error('Save article error:', err);
        showNotification('Błąd podczas zapisywania artykułu', 'error');
    }
}

// Preview article
function previewArticle() {
    const title = document.getElementById('articleTitle').value || 'Bez tytułu';
    const content = editor.value();
    const summary = document.getElementById('articleSummary').value;

    if (!content) {
        showNotification('Brak zawartości do podglądu', 'error');
        return;
    }

    const html = `
        <div class="article-metadata">
            <div class="metadata-item">
                <span class="metadata-label">Autor</span>
                <span class="metadata-value">${currentUser.email}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Data</span>
                <span class="metadata-value">${new Date().toLocaleDateString('pl-PL')}</span>
            </div>
        </div>

        <h1>${escapeHtml(title)}</h1>
        
        ${summary ? `<p style="font-style: italic; color: #7f8c8d;">${escapeHtml(summary)}</p>` : ''}

        <div class="editor-preview">
            ${markdownToHtml(content)}
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #bdc3c7;">
            <p style="color: #7f8c8d; font-size: 0.9rem;">
                <strong>Autor:</strong> ${currentUser.email}<br>
                <strong>Data publikacji:</strong> ${new Date().toLocaleString('pl-PL')}
            </p>
        </div>
    `;

    document.getElementById('articlePreviewContent').innerHTML = html;
    document.getElementById('articlePreviewModal').classList.add('active');
}

// Preview course
function previewCourse() {
    const title = document.getElementById('courseTitle').value || 'Bez tytułu';
    const description = document.getElementById('courseDescription').value;

    if (courseStages.length === 0) {
        showNotification('Brak etapów do podglądu', 'error');
        return;
    }

    let stagesHtml = courseStages.map((stage, idx) => `
        <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #3498db;">
            <h3>Etap ${idx + 1}: ${escapeHtml(stage.title)}</h3>
            <div class="editor-preview" style="margin-top: 10px;">
                ${markdownToHtml(stage.content)}
            </div>
        </div>
    `).join('');

    const html = `
        <div class="article-metadata">
            <div class="metadata-item">
                <span class="metadata-label">Autor</span>
                <span class="metadata-value">${currentUser.email}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Etapów</span>
                <span class="metadata-value">${courseStages.length}</span>
            </div>
        </div>

        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p style="color: #7f8c8d; font-size: 1rem; margin-bottom: 20px;">${escapeHtml(description)}</p>` : ''}

        <div>
            ${stagesHtml}
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #bdc3c7;">
            <p style="color: #7f8c8d; font-size: 0.9rem;">
                <strong>Autor:</strong> ${currentUser.email}<br>
                <strong>Data publikacji:</strong> ${new Date().toLocaleString('pl-PL')}
            </p>
        </div>
    `;

    document.getElementById('coursePreviewContent').innerHTML = html;
    document.getElementById('coursePreviewModal').classList.add('active');
}

// Export article
function exportArticle() {
    const title = document.getElementById('articleTitle').value || 'article';
    const content = editor.value();

    if (!content) {
        showNotification('Brak zawartości do eksportu', 'error');
        return;
    }

    const dataStr = `# ${title}\n\n${content}`;
    const blob = new Blob([dataStr], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();

    showNotification('Artykuł został wyeksportowany', 'success');
}

// Import file
function importFile() {
    document.getElementById('fileInput').click();
}

// Handle file import
function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target.result;
        editor.value(content);
        showNotification('Plik został załadowany', 'success');
    };
    reader.readAsText(file);

    // Reset input
    document.getElementById('fileInput').value = '';
}

// Save course
async function saveCourse() {
    const token = localStorage.getItem('token');
    const title = document.getElementById('courseTitle').value.trim();
    const description = document.getElementById('courseDescription').value.trim();

    if (!title) {
        showNotification('Proszę wpisać tytuł kursu', 'error');
        return;
    }

    if (courseStages.length === 0) {
        showNotification('Proszę dodać co najmniej jeden etap', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/courses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title,
                description,
                stages: courseStages
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save course');
        }

        showNotification('Kurs został opublikowany!', 'success');

        // Reset form
        document.getElementById('courseTitle').value = '';
        document.getElementById('courseDescription').value = '';
        courseStages = [];
        renderCourseStages();

        // Redirect to courses view
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    } catch (err) {
        console.error('Save course error:', err);
        showNotification('Błąd podczas zapisywania kursu', 'error');
    }
}

function resetArticleForm() {
    if (!confirm('Czy na pewno chcesz wyczyścić formularz artykułu?')) {
        return;
    }
    document.getElementById('articleTitle').value = '';
    document.getElementById('articleSummary').value = '';
    editor.value('');
    document.getElementById('publishArticle').checked = true;
}

function resetCourseForm() {
    if (!confirm('Czy na pewno chcesz wyczyścić formularz kursu?')) {
        return;
    }
    document.getElementById('courseTitle').value = '';
    document.getElementById('courseDescription').value = '';
    courseStages = [];
    renderCourseStages();
}

function goToDashboard() {
    window.location.href = 'dashboard.html';
}

// Add course stage
function addCourseStage() {
    const stageNumber = courseStages.length + 1;
    courseStages.push({
        title: `Etap ${stageNumber}`,
        content: ''
    });
    renderCourseStages();
}

// Render course stages
function renderCourseStages() {
    const container = document.getElementById('stagesContainer');
    const noMsg = document.getElementById('noStagesMsg');

    if (courseStages.length === 0) {
        container.innerHTML = '';
        noMsg.style.display = 'block';
        return;
    }

    noMsg.style.display = 'none';

    container.innerHTML = courseStages.map((stage, idx) => `
        <div class="stage-card">
            <div class="stage-info">
                <div>
                    <span class="stage-number">${idx + 1}</span>
                    <span class="stage-title">${escapeHtml(stage.title)}</span>
                </div>
                <div class="stage-preview">
                    ${stage.content ? stage.content.substring(0, 80) + '...' : 'Brak zawartości'}
                </div>
            </div>
            <div class="stage-actions">
                <button class="btn btn-sm btn-secondary" onclick="editStage(${idx})">Edytuj</button>
                <button class="btn btn-sm btn-danger" onclick="deleteStage(${idx})">Usuń</button>
            </div>
        </div>
    `).join('');
}

// Edit stage
function editStage(index) {
    currentEditingStageIndex = index;
    const stage = courseStages[index];

    document.getElementById('stageTitle').value = stage.title;
    stageEditor.value(stage.content);

    document.getElementById('stageEditModal').classList.add('active');

    setTimeout(() => {
        stageEditor.codemirror.refresh();
    }, 100);
}

// Save stage
function saveStage() {
    if (currentEditingStageIndex === null) return;

    courseStages[currentEditingStageIndex].title = document.getElementById('stageTitle').value || 'Bez tytułu';
    courseStages[currentEditingStageIndex].content = stageEditor.value();

    renderCourseStages();
    closeModals();
    showNotification('Etap został zaktualizowany', 'success');
}

// Delete stage
function deleteStage(index) {
    if (confirm('Czy na pewno chcesz usunąć ten etap?')) {
        courseStages.splice(index, 1);
        renderCourseStages();
        showNotification('Etap został usunięty', 'success');
    }
}

// Utility functions
function escapeHtml(text) {
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
    let html = markdown
        .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
        .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
        .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^- (.*?)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/^`(.*?)$/gm, '<code>$1</code>')
        .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');

    if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<pre')) {
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

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

function logout() {
    if (confirm('Czy na pewno chcesz się wylogować?')) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}
