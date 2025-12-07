// Admin Panel JavaScript
const API_BASE = window.API_CONFIG.BASE_URL;
let currentUser = null;
let allUsers = [];
let allArticles = [];
let allCourses = [];
let allResources = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupEventListeners();
    await loadDashboardData();
});

// Check if user is authenticated and is admin
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

        // Check if user is admin
        if (currentUser.role !== 'admin') {
            showNotification('Brak dostępu. Tylko administratorzy mogą uzyskać dostęp do tej strony.', 'error');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
            return;
        }

        document.getElementById('adminUser').textContent = `👤 ${currentUser.email}`;
    } catch (err) {
        console.error('Auth error:', err);
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            switchSection(section);
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Search
    document.getElementById('searchInput').addEventListener('input', performSearch);

    // Role filter
    document.getElementById('roleFilter')?.addEventListener('change', loadUsers);

    // User filter for resources
    document.getElementById('userFilter')?.addEventListener('change', loadResources);

    // Settings
    document.getElementById('resetDbBtn')?.addEventListener('click', resetDatabase);
    document.getElementById('exportDataBtn')?.addEventListener('click', exportData);

    // Modal close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    document.getElementById('closeUserModalBtn')?.addEventListener('click', closeModals);
    document.getElementById('closeResourceModalBtn')?.addEventListener('click', closeModals);

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModals();
        });
    });
}

// Switch sections
function switchSection(sectionName) {
    // Update sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        users: 'Zarządzanie Użytkownikami',
        articles: 'Zarządzanie Artykułami',
        courses: 'Zarządzanie Kursami',
        resources: 'Zarządzanie Zasobami',
        settings: 'Ustawienia'
    };
    document.getElementById('sectionTitle').textContent = titles[sectionName] || 'Dashboard';

    // Load data for section
    if (sectionName === 'users') loadUsers();
    if (sectionName === 'articles') loadArticles();
    if (sectionName === 'courses') loadCourses();
    if (sectionName === 'resources') loadResources();
    if (sectionName === 'settings') loadSystemInfo();
}

// Load dashboard data
async function loadDashboardData() {
    try {
        const token = localStorage.getItem('token');

        // Get users count
        const usersResult = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (usersResult.ok) {
            allUsers = await usersResult.json();
            document.getElementById('userCount').textContent = allUsers.length;
            document.getElementById('adminCount').textContent = allUsers.filter(u => u.role === 'admin').length;
        }

        // Get articles count
        const articlesResult = await fetch(`${API_BASE}/articles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (articlesResult.ok) {
            allArticles = await articlesResult.json();
        }

        // Get courses count
        const coursesResult = await fetch(`${API_BASE}/courses`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (coursesResult.ok) {
            allCourses = await coursesResult.json();
        }

        // Get resources count
        const resourcesResult = await fetch(`${API_BASE}/resources`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resourcesResult.ok) {
            const data = await resourcesResult.json();
            allResources = data.resources || [];
            document.getElementById('resourceCount').textContent = allResources.length;
        }

        // Check database status
        document.getElementById('dbStatus').textContent = '✅ Działająca';

        // Load activity log
        loadActivityLog();
    } catch (err) {
        console.error('Dashboard error:', err);
        document.getElementById('dbStatus').textContent = '❌ Błąd';
    }
}

// Load users
async function loadUsers() {
    try {
        const token = localStorage.getItem('token');
        const roleFilter = document.getElementById('roleFilter').value;

        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load users');

        allUsers = await response.json();

        let filteredUsers = allUsers;
        if (roleFilter) {
            filteredUsers = allUsers.filter(u => u.role === roleFilter);
        }

        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        if (filteredUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">Brak użytkowników</td></tr>';
            return;
        }

        filteredUsers.forEach(user => {
            const row = document.createElement('tr');
            const userResources = allResources.filter(r => r.owner_id === user.id).length;

            row.innerHTML = `
                <td>${user.id}</td>
                <td><strong>${user.email}</strong></td>
                <td><span class="role-badge ${user.role}">${user.role === 'admin' ? '👑 Admin' : '👤 User'}</span></td>
                <td>${userResources}</td>
                <td>${new Date(user.created_at).toLocaleDateString('pl-PL')}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="viewUserDetails(${user.id})">View</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        updateUserFilter();
    } catch (err) {
        console.error('Load users error:', err);
        showNotification('Błąd podczas ładowania użytkowników', 'error');
    }
}

// Load resources
async function loadResources() {
    try {
        const token = localStorage.getItem('token');
        const userFilter = document.getElementById('userFilter').value;

        // Get all resources (as admin)
        const response = await fetch(`${API_BASE}/admin/resources`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            // Fallback: get own resources
            const fallbackRes = await fetch(`${API_BASE}/resources`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await fallbackRes.json();
            allResources = data.resources || [];
        } else {
            allResources = await response.json();
        }

        let filteredResources = allResources;
        if (userFilter) {
            filteredResources = allResources.filter(r => r.owner_id === parseInt(userFilter));
        }

        const tbody = document.getElementById('resourcesTableBody');
        tbody.innerHTML = '';

        if (filteredResources.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">Brak zasobów</td></tr>';
            return;
        }

        filteredResources.forEach(resource => {
            const owner = allUsers.find(u => u.id === resource.owner_id);
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${resource.id}</td>
                <td>${owner?.id || 'Unknown'}</td>
                <td>${owner?.email || 'Unknown'}</td>
                <td><code>${JSON.stringify(resource.data).substring(0, 50)}...</code></td>
                <td>${new Date(resource.created_at).toLocaleDateString('pl-PL')}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="viewResourceDetails(${resource.id})">View</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteResource(${resource.id})">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error('Load resources error:', err);
        showNotification('Błąd podczas ładowania zasobów', 'error');
    }
}

// View user details
function viewUserDetails(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const modal = document.getElementById('userModal');
    const body = document.getElementById('userModalBody');

    body.innerHTML = `
        <div class="modal-field">
            <label>ID:</label>
            <input type="text" value="${user.id}" readonly>
        </div>
        <div class="modal-field">
            <label>Email:</label>
            <input type="email" value="${user.email}" readonly>
        </div>
        <div class="modal-field">
            <label>Rola:</label>
            <input type="text" value="${user.role}" readonly>
        </div>
        <div class="modal-field">
            <label>Data Rejestracji:</label>
            <input type="text" value="${new Date(user.created_at).toLocaleString('pl-PL')}" readonly>
        </div>
    `;

    modal.classList.add('active');
}

// View resource details
function viewResourceDetails(resourceId) {
    const resource = allResources.find(r => r.id === resourceId);
    if (!resource) return;

    const owner = allUsers.find(u => u.id === resource.owner_id);
    const modal = document.getElementById('resourceModal');
    const body = document.getElementById('resourceModalBody');

    body.innerHTML = `
        <div class="modal-field">
            <label>ID:</label>
            <input type="text" value="${resource.id}" readonly>
        </div>
        <div class="modal-field">
            <label>Właściciel:</label>
            <input type="text" value="${owner?.email || 'Unknown'}" readonly>
        </div>
        <div class="modal-field">
            <label>Dane:</label>
            <textarea readonly>${JSON.stringify(resource.data, null, 2)}</textarea>
        </div>
        <div class="modal-field">
            <label>Data Utworzenia:</label>
            <input type="text" value="${new Date(resource.created_at).toLocaleString('pl-PL')}" readonly>
        </div>
    `;

    modal.classList.add('active');
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Czy na pewno chcesz usunąć tego użytkownika? Jego zasoby również zostaną usunięte.')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showNotification('Użytkownik został usunięty', 'success');
            loadUsers();
            loadDashboardData();
        } else {
            showNotification('Błąd podczas usuwania użytkownika', 'error');
        }
    } catch (err) {
        console.error('Delete user error:', err);
        showNotification('Błąd podczas usuwania użytkownika', 'error');
    }
}

// Delete resource
async function deleteResource(resourceId) {
    if (!confirm('Czy na pewno chcesz usunąć ten zasób?')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/resources/${resourceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showNotification('Zasób został usunięty', 'success');
            loadResources();
            loadDashboardData();
        } else {
            showNotification('Błąd podczas usuwania zasobu', 'error');
        }
    } catch (err) {
        console.error('Delete resource error:', err);
        showNotification('Błąd podczas usuwania zasobu', 'error');
    }
}

// Update user filter for resources
function updateUserFilter() {
    const select = document.getElementById('userFilter');
    const currentValue = select.value;

    select.innerHTML = '<option value="">Wszyscy użytkownicy</option>';
    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.email;
        select.appendChild(option);
    });

    select.value = currentValue;
}

// Perform search
function performSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase();

    if (!query) {
        loadUsers();
        loadResources();
        return;
    }

    // Filter users
    const filteredUsers = allUsers.filter(u =>
        u.email.toLowerCase().includes(query) ||
        u.id.toString().includes(query)
    );

    const userTbody = document.getElementById('usersTableBody');
    userTbody.innerHTML = '';

    if (filteredUsers.length === 0) {
        userTbody.innerHTML = '<tr><td colspan="6" class="no-data">Brak wyników</td></tr>';
    } else {
        filteredUsers.forEach(user => {
            const row = document.createElement('tr');
            const userResources = allResources.filter(r => r.owner_id === user.id).length;

            row.innerHTML = `
                <td>${user.id}</td>
                <td><strong>${user.email}</strong></td>
                <td><span class="role-badge ${user.role}">${user.role === 'admin' ? '👑 Admin' : '👤 User'}</span></td>
                <td>${userResources}</td>
                <td>${new Date(user.created_at).toLocaleDateString('pl-PL')}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="viewUserDetails(${user.id})">View</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Delete</button>
                    </div>
                </td>
            `;
            userTbody.appendChild(row);
        });
    }
}

// Load system info
async function loadSystemInfo() {
    const infoDiv = document.getElementById('systemInfo');
    infoDiv.innerHTML = `
        <p><strong>Wersja API:</strong> 1.0.0</p>
        <p><strong>Środowisko:</strong> ${window.location.hostname === 'localhost' ? 'Development' : 'Production'}</p>
        <p><strong>Użytkownik:</strong> ${currentUser?.email}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</p>
        <p><strong>Baza danych:</strong> PostgreSQL</p>
    `;
}

// Load activity log
function loadActivityLog() {
    const activityLog = document.getElementById('activityLog');
    const activities = [
        { type: 'users_loaded', message: `Załadowano ${allUsers.length} użytkowników` },
        { type: 'resources_loaded', message: `Załadowano ${allResources.length} zasobów` },
        { type: 'admin_login', message: `Administrator ${currentUser?.email} zalogował się` }
    ];

    activityLog.innerHTML = '';
    activities.slice(0, 5).forEach(activity => {
        const div = document.createElement('div');
        div.className = 'activity-item';
        div.innerHTML = `<strong>${activity.type}:</strong> ${activity.message}`;
        activityLog.appendChild(div);
    });
}

// Load articles
async function loadArticles() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/articles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load articles');

        allArticles = await response.json();

        const tbody = document.getElementById('articlesTableBody');
        tbody.innerHTML = '';

        if (allArticles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Brak artykułów</td></tr>';
            return;
        }

        allArticles.forEach(article => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${article.id}</td>
                <td>${article.title}</td>
                <td>${article.author_email}</td>
                <td>${new Date(article.created_at).toLocaleDateString('pl-PL')}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="viewArticleDetail(${article.id})">View</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteArticle(${article.id})">Usuń</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error('Load articles error:', err);
        showNotification('Błąd podczas ładowania artykułów', 'error');
    }
}

// Load courses
async function loadCourses() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/courses`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load courses');

        allCourses = await response.json();

        const tbody = document.getElementById('coursesTableBody');
        tbody.innerHTML = '';

        if (allCourses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">Brak kursów</td></tr>';
            return;
        }

        allCourses.forEach(course => {
            const row = document.createElement('tr');
            const stagesCount = course.stages ? course.stages.length : 0;
            row.innerHTML = `
                <td>${course.id}</td>
                <td>${course.title}</td>
                <td>${course.author_email}</td>
                <td>${stagesCount}</td>
                <td>${new Date(course.created_at).toLocaleDateString('pl-PL')}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="viewCourseDetail(${course.id})">View</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCourse(${course.id})">Usuń</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error('Load courses error:', err);
        showNotification('Błąd podczas ładowania kursów', 'error');
    }
}

// Delete article
async function deleteArticle(articleId) {
    if (!confirm('Czy na pewno chcesz usunąć ten artykuł?')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/articles/${articleId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showNotification('Artykuł został usunięty', 'success');
            loadArticles();
        } else {
            showNotification('Błąd podczas usuwania artykułu', 'error');
        }
    } catch (err) {
        console.error('Delete article error:', err);
        showNotification('Błąd podczas usuwania artykułu', 'error');
    }
}

// Delete course
async function deleteCourse(courseId) {
    if (!confirm('Czy na pewno chcesz usunąć ten kurs? Wszystkie etapy zostaną usunięte.')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/courses/${courseId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showNotification('Kurs został usunięty', 'success');
            loadCourses();
        } else {
            showNotification('Błąd podczas usuwania kursu', 'error');
        }
    } catch (err) {
        console.error('Delete course error:', err);
        showNotification('Błąd podczas usuwania kursu', 'error');
    }
}

// View article detail
function viewArticleDetail(articleId) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;

    const modal = document.getElementById('userModal');
    const body = document.getElementById('userModalBody');

    body.innerHTML = `
        <div class="modal-field">
            <label>ID:</label>
            <input type="text" value="${article.id}" readonly>
        </div>
        <div class="modal-field">
            <label>Tytuł:</label>
            <input type="text" value="${article.title}" readonly>
        </div>
        <div class="modal-field">
            <label>Autor:</label>
            <input type="text" value="${article.author_email}" readonly>
        </div>
        <div class="modal-field">
            <label>Zawartość:</label>
            <textarea readonly style="height: 200px;">${article.content}</textarea>
        </div>
        <div class="modal-field">
            <label>Data Utworzenia:</label>
            <input type="text" value="${new Date(article.created_at).toLocaleString('pl-PL')}" readonly>
        </div>
    `;

    modal.classList.add('active');
}

// View course detail
function viewCourseDetail(courseId) {
    const course = allCourses.find(c => c.id === courseId);
    if (!course) return;

    const stagesHtml = (course.stages || []).map((stage, idx) => `
        <div style="margin-bottom: 15px; padding: 10px; background: #f0f0f0; border-radius: 5px;">
            <strong>Etap ${idx + 1}: ${stage.title}</strong>
            <p style="margin-top: 5px; white-space: pre-wrap;">${stage.content.substring(0, 200)}...</p>
        </div>
    `).join('');

    const modal = document.getElementById('userModal');
    const body = document.getElementById('userModalBody');

    body.innerHTML = `
        <div class="modal-field">
            <label>ID:</label>
            <input type="text" value="${course.id}" readonly>
        </div>
        <div class="modal-field">
            <label>Tytuł:</label>
            <input type="text" value="${course.title}" readonly>
        </div>
        <div class="modal-field">
            <label>Autor:</label>
            <input type="text" value="${course.author_email}" readonly>
        </div>
        <div class="modal-field">
            <label>Opis:</label>
            <textarea readonly>${course.description || ''}</textarea>
        </div>
        <div class="modal-field">
            <label>Etapy (${(course.stages || []).length}):</label>
            <div>${stagesHtml}</div>
        </div>
        <div class="modal-field">
            <label>Data Utworzenia:</label>
            <input type="text" value="${new Date(course.created_at).toLocaleString('pl-PL')}" readonly>
        </div>
    `;

    modal.classList.add('active');
}

// Export data
async function exportData() {
    try {
        const data = {
            users: allUsers,
            articles: allArticles,
            courses: allCourses,
            resources: allResources,
            exportDate: new Date().toISOString(),
            exportBy: currentUser?.email
        };

        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fse-it-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        showNotification('Dane zostały wyeksportowane', 'success');
    } catch (err) {
        console.error('Export error:', err);
        showNotification('Błąd podczas eksportu danych', 'error');
    }
}

// Reset database
async function resetDatabase() {
    const confirmText = prompt(
        'Wpisz "RESET" aby potwierdzić reset bazy danych. Ta operacja jest NIEODWRACALNA i usunie wszystkie dane.'
    );

    if (confirmText !== 'RESET') {
        showNotification('Reset anulowany', 'warning');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/admin/reset`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showNotification('Baza danych została zresetowana', 'success');
            allUsers = [];
            allArticles = [];
            allCourses = [];
            allResources = [];
            loadDashboardData();
            loadUsers();
        } else {
            showNotification('Błąd podczas resetowania bazy danych', 'error');
        }
    } catch (err) {
        console.error('Reset error:', err);
        showNotification('Błąd podczas resetowania bazy danych', 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Close modals
function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Logout
function logout() {
    if (confirm('Czy na pewno chcesz się wylogować?')) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}
