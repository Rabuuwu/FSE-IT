# FSE-IT — Technical Documentation

## 1) Project Overview
FSE-IT is a full‑stack educational resource management system with:
- **Backend API** (Node.js/Express) exposing authentication, resources, articles and courses endpoints.
- **Frontend** (HTML/CSS/Vanilla JS) for login/registration, dashboard, admin panel, article/course creator and viewer.
- **Database** (PostgreSQL) storing users, roles, resources, articles, courses, and course stages.

Primary goals (per README): educational resource management, role‑based admin management, and a zero‑cost deployment profile (frontend static hosting + backend on Render + Postgres on a free tier service).

---

## 2) Repository Structure
```
/ (root)
├─ coreFSE.js              # Express API server (routes, schema init, startup)
├─ db.js                   # PostgreSQL pool configuration
├─ auth.js                 # JWT auth middleware
├─ config.js               # Frontend API base URL resolver
├─ package.json            # Node dependencies and scripts
├─ README.md               # High‑level project overview
├─ RENDER_DEPLOYMENT.md    # Render deployment environment variables
├─ index.html              # Landing page
├─ login.html              # Login page
├─ register.html           # Registration page
├─ dashboard.html          # User dashboard (resources + materials view)
├─ admin.html              # Admin panel
├─ admin.js                # Admin UI logic
├─ article-creator.html    # Article/course editor UI
├─ article-creator.js      # Editor logic (SimpleMDE + save/preview)
├─ article-viewer.html     # Materials viewer UI
├─ article-viewer.js       # Materials viewer logic (filters + modals)
└─ css/
   ├─ index.css
   ├─ login.css
   ├─ register.css
   ├─ dashboard.css
   ├─ admin.css
   ├─ article-creator.css
   └─ article-viewer.css
```

---

## 3) Runtime & Dependencies
### Backend
- **Node.js** with **Express**
- **bcrypt** for password hashing
- **jsonwebtoken** for JWT auth
- **pg** for PostgreSQL connection

### Frontend
- Vanilla HTML/CSS/JS
- SimpleMDE for Markdown editing (loaded from CDN in `article-creator.html`)

### Scripts
From [package.json](package.json):
- `npm start` → `node coreFSE.js`

---

## 4) Configuration
### Environment Variables
From [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md):
- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL=postgres_connection_string`
- `JWT_SECRET=your_secure_secret`
- `JWT_EXPIRES_IN=24h`
- `BCRYPT_SALT_ROUNDS=12`

Additional DB options supported in [db.js](db.js):
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- `PGSSLMODE=require` or `DATABASE_SSL=true`

### Frontend API Base URL
From [config.js](config.js):
- Localhost → `http://localhost:3000`
- Production → `https://fse-it.onrender.com`

`window.API_CONFIG.BASE_URL` is used in frontend pages.

---

## 5) Database Schema
Created and ensured at startup by `ensureSchema()` in [coreFSE.js](coreFSE.js):

### roles
- `id SERIAL PRIMARY KEY`
- `name TEXT UNIQUE NOT NULL` (default: `user`, `admin`)
- `description TEXT`
- `created_at TIMESTAMP WITH TIME ZONE DEFAULT now()`

### users
- `id SERIAL PRIMARY KEY`
- `email TEXT UNIQUE NOT NULL`
- `password_hash TEXT NOT NULL`
- `role_id INTEGER DEFAULT 1 REFERENCES roles(id)`
- `created_at TIMESTAMP WITH TIME ZONE DEFAULT now()`

### articles
- `id SERIAL PRIMARY KEY`
- `author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `title TEXT NOT NULL`
- `content TEXT NOT NULL`
- `summary TEXT`
- `type VARCHAR(20) DEFAULT 'article'`
- `created_at TIMESTAMP WITH TIME ZONE DEFAULT now()`
- `updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()`

### courses
- `id SERIAL PRIMARY KEY`
- `author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `title TEXT NOT NULL`
- `description TEXT`
- `created_at TIMESTAMP WITH TIME ZONE DEFAULT now()`
- `updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()`

### course_stages
- `id SERIAL PRIMARY KEY`
- `course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE`
- `stage_number INTEGER NOT NULL`
- `title TEXT NOT NULL`
- `content TEXT NOT NULL`
- `order_index INTEGER NOT NULL`
- `created_at TIMESTAMP WITH TIME ZONE DEFAULT now()`
- `UNIQUE(course_id, stage_number)`

### resources (legacy)
- `id SERIAL PRIMARY KEY`
- `owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `data JSONB`
- `created_at TIMESTAMP WITH TIME ZONE DEFAULT now()`

---

## 6) Authentication & Authorization
### JWT Auth
- JWT token issued on login (`POST /login`).
- Token must be provided in `Authorization: Bearer <token>`.
- Middleware: [auth.js](auth.js).
- Token payload: `{ user_id, role_id, role }`.

### Roles
- `user`: basic access to their own resources and content.
- `admin`: access to admin endpoints and management UI.

### Token Storage (Frontend)
- Token stored and retrieved under `localStorage` key `'token'` consistently across all pages.
- Used in [login.html](login.html), [index.html](index.html), [dashboard.html](dashboard.html), and all other authenticated pages.

---

## 7) Backend API Endpoints
Defined in [coreFSE.js](coreFSE.js). All protected endpoints require `Authorization: Bearer <token>`.

### Public
- `GET /` — API info and available endpoints.
- `POST /register` — Create user account.
  - Body: `{ email, password }`
  - Errors: `400`, `409`, `500`
- `POST /login` — Login user.
  - Body: `{ email, password }`
  - Response: `{ token }`
  - Errors: `400`, `401`, `500`

### Authenticated
- `GET /me` — Get current user info (id, email, role).
- `GET /resources` — User’s resources.
- `POST /resources` — Create resource.
  - Body: `{ data }`
- `DELETE /resources/:id` — Delete resource (owner or admin).

### Admin‑Only
- `GET /users` — List all users.
- `DELETE /users/:id` — Delete user (cannot delete self).
- `GET /admin/resources` — List all resources.
- `POST /admin/reset` — **DANGEROUS:** truncate data and recreate default roles.

### Articles
- `GET /articles` — List all articles with author email.
- `GET /articles/:id` — Single article by id.
- `POST /articles` — Create article.
  - Body: `{ title, content, summary, published }`
- `DELETE /articles/:id` — Delete (author or admin).

### Courses
- `GET /courses` — List all courses (each with stages).
- `GET /courses/:id` — Single course with stages.
- `POST /courses` — Create course.
  - Body: `{ title, description, stages: [{ title, content }, ...] }`
- `DELETE /courses/:id` — Delete (author or admin) + cascade stages.

---

## 8) Frontend Pages & Behavior

### Landing
- [index.html](index.html)
  - Minimal landing page with Register/Login buttons.
  - Redirect logic checks `localStorage.getItem('token')` and redirects to dashboard if logged in.

### Auth
- [login.html](login.html)
  - Sends login to `/login`.
  - Stores token in `localStorage` under key `token`.
- [register.html](register.html)
  - Creates account via `/register` then redirects to login.

### Dashboard
- [dashboard.html](dashboard.html)
  - Requires `token` in localStorage.
  - Uses `/me`, `/resources`, `/articles`, `/courses` for counts and lists.
  - Two in‑page views:
    - **Resources** view (legacy JSON resources)
    - **Materials** view (articles + courses)

### Article/Course Creator
- [article-creator.html](article-creator.html), [article-creator.js](article-creator.js)
  - Markdown editor (SimpleMDE).
  - Two modes: Article or Course.
  - Course editor supports multi‑stage authoring.
  - Save → POST `/articles` or `/courses`.
  - Preview modal rendering with Markdown conversion.

### Article/Course Viewer
- [article-viewer.html](article-viewer.html), [article-viewer.js](article-viewer.js)
  - Load all articles/courses and filter by type, search, and sort.
  - Displays modals with full content.
  - Shows counts per type.

### Admin Panel
- [admin.html](admin.html), [admin.js](admin.js)
  - Admin‑only access; redirects non‑admins.
  - Sections: dashboard, users, articles, courses, resources, settings.
  - Data operations:
    - Manage users
    - Manage resources
    - Manage articles/courses
    - Export data
    - Reset database

---

## 9) Frontend Auth Flow
1. User logs in via [login.html](login.html).
2. Token stored in `localStorage` under `token`.
3. Each page loads `/me` with Bearer token.
4. Role‑based UI (admin link visible only for admin users).

---

## 10) Error Handling & Logging
- Backend logs errors in each route and startup.
- Startup validates database connectivity with `SELECT NOW()`.
- Frontend shows user‑friendly errors for network issues and auth failures.

---

## 11) Deployment Notes
- Frontend: static hosting (Netlify/Vercel/GH Pages).
- Backend: Render (sleep mode possible).
- Database: Postgres provider (Render/Neon/Supabase).

Ensure `DATABASE_URL` or PG* env vars are configured in production; use SSL if required.

---

## 12) Code Quality & Optimization

### Backend (coreFSE.js) Improvements
- **Debug Mode**: Added `DEBUG` flag (enabled in development, disabled in production) to control verbose logging
  - Set `DEBUG=true` env var to enable detailed logging in production if needed
  - All non-critical console.log calls are now conditional on DEBUG flag
  - Error messages always show (console.error) but only include full stack traces in DEBUG mode
  
- **Error Handling Standardization**
  - All async route handlers follow consistent error patterns
  - Error responses never expose internal details in production
  - In DEBUG mode, detailed error information is provided for troubleshooting

- **CORS Optimization**
  - Removed verbose CORS logging, kept production-ready configuration
  - Efficient origin checking for allowed domains

### Frontend Code Quality
- **Shared Utilities (utils.js)**
  - Centralized utility functions to prevent code duplication
  - Exported functions:
    - `escapeHtml(text)` - XSS prevention
    - `markdownToHtml(markdown)` - Markdown rendering
    - `showNotification(message, type, duration)` - User notifications
    - `formatDate()`, `formatDateTime()` - Date formatting
    - `hasAuthToken()`, `getAuthToken()`, `removeAuthToken()` - Token management
    - `fetchWithAuth(url, options)` - Authenticated API calls
    - `handleAuthError(error)` - Centralized auth error handling

- **Security Hardening**
  - All user input sanitization via `escapeHtml()` verified
  - All innerHTML content properly escaped
  - JSON.stringify used for safe data display
  - Bearer token Authorization header properly constructed

- **Logging Optimization**
  - Frontend console.error messages kept for development debugging
  - Production error messages are user-friendly and don't expose internals
  - User feedback provided through notification system

## 13) Known Implementation Notes
- Admin reset endpoint deletes all rows; use with caution.
- All pages use consistent token storage key: `'token'` in localStorage.

---

## 13) Known Implementation Notes
- Admin reset endpoint deletes all rows; use with caution.
- All pages use consistent token storage key: `'token'` in localStorage.
- Shared utility functions available in [utils.js](utils.js) - imported by authentication pages and can be used globally.
- DEBUG flag in [coreFSE.js](coreFSE.js) controls verbose backend logging (development only by default).

---

## 14) Quick Start (Local)
1. Install dependencies:
   - `npm install`
2. Set `.env`:
   - `DATABASE_URL=...`
   - `JWT_SECRET=...`
3. Start API:
   - `npm start`
4. Open `index.html` or `login.html` in browser (or via Live Server).

---

## 14) License
See [LICENSE](LICENSE).
