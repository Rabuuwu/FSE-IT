# 🚀 FSE-IT: Full-Stack Self-Development IT System

## 🌟 Primary Goal

The main goal of this project is to build a complex, production-ready **Educational Resource Management System** integrating **Machine Learning (ML)** and **Automated Testing**, all hosted on a sustainable **Zero-Cost Architecture**.

---

## 🔗 Live Application & Repository Links

| Element | Description | Link | Status |
| :--- | :--- | :--- | :--- |
| **Live App (Frontend)** | Zero-Cost Deployment - may experience initial latency due to server 'sleep mode'. | **[YOUR NETLIFY/GH PAGES URL HERE]** | ⏳ In Development / Deployed |
| **Source Code** | Main repository for all application files (Core API, ML, UI, Tests). | **[THIS GITHUB REPO URL]** | Active Development |
| **E2E Tests** | Dedicated folder with Python/C# Selenium/Playwright scripts and reports. | **[LINK TO /tests FOLDER IN THIS REPO]** | Pending |

---

## 📋 FUNCTIONAL REQUIREMENTS & OPERATIONAL MECHANICS

### System Components Overview

This section details the expected behavior and core logic of the FSE-IT system.

<details>
<summary>👤 Identity Management & Authentication (Backend Core API)</summary>

* **User Registration:** Users must be able to register with email and password. The Core API (**PHP/Node.js**) validates input and securely hashes passwords into the database (**PostgreSQL/MySQL**).
* **Login & Sessions:** Upon successful login, the system generates a session token (e.g., JWT) for API call authorization.
* **Roles:** The system supports two primary roles: `User` (can view and rate resources) and `Administrator` (can manage all resources and users).

</details>

<details>
<summary>📚 Resource Management (Backend Core API & Database)</summary>

* **Resources:** A resource is any educational item (article, course link, PDF) containing a title, author, description, **tags**, and URL link.
* **Administrator Functionality:**
    * Admins have full **CRUD (Create, Read, Update, Delete)** access for all resources.
    * Admins can assign tags to resources (e.g., "Cloud", "Python", "Security").
* **User Access:** Regular users can browse the resource list, filter by tags, and search by keyword/phrase.

</details>

<details>
<summary>🧠 Machine Learning Module (API ML - Python)</summary>

* **Activity Tracking:** The Backend Core API logs all resources viewed/rated by a user into the database.
* **Recommendation Endpoint:** The dedicated API ML (Python) exposes an endpoint: `GET /recommendations/{user_id}`.
* **Recommendation Mechanism:** Upon call, the API ML:
    1.  Retrieves the user's viewing history from the database.
    2.  Uses a simple **ML model** (e.g., tag-based similarity or basic clustering with **Scikit-learn/Pandas**) to recommend **5 new resources** matching the user's historical interests.
* **Presentation:** Recommendations are prominently displayed in a "Suggested For You" section on the user's homepage.

</details>

<details>
<summary>✅ Quality Assurance (Testing & Debugging)</summary>

* **Unit/Integration Tests:** Basic tests cover critical Backend functions (e.g., correct password hashing, unauthorized API request rejection).
* **E2E (End-to-End) Tests:** **Selenium/Playwright** scripts (Python/C#) must automatically verify:
    * Successful user registration and login.
    * Successful creation of a new resource by an `Administrator` role.
    * Validation that the **API ML** endpoint successfully returns recommendations after a resource is viewed.

</details>

<details>
<summary>💸 Architecture & Maintenance (Zero-Cost Deployment)</summary>

* **Distributed Deployment:** Every component (Frontend, Core API, API ML, DB) is hosted on a different, free-tier platform, adhering to the Zero-Cost model.
* **Architecture Documentation:** The `README.md` will clearly explain this distributed setup, including the necessity of **'sleep mode'** on certain backend services as a conscious cost-management decision.
* **Versioning:** All code is hosted and versioned on **GitHub**.

</details>

---

## 🛠️ ZERO-COST TECHNICAL ARCHITECTURE

This project utilizes free-tier services exclusively to demonstrate modern microservice architecture and cloud cost awareness.

| Component | Technology | Hosting (Free Tier Platform) |
| :--- | :--- | :--- |
| **Frontend (UI)** | HTML, CSS, JavaScript (JS) | **Netlify / Vercel / GitHub Pages** (Static Hosting) |
| **Backend Core (API)** | PHP (SMARTY) or Node.js (Express) | **Render / Railway** (Free Plan with Sleep Mode) |
| **Database (DB)** | PostgreSQL / MySQL | **Supabase / Neon** (Generous Free Tier) |
| **API ML (Python)** | Python (Flask/FastAPI, Pandas, Scikit-learn) | **PythonAnywhere / Render** (Free Plan) |
| **Source Code/Tests** | Git, Python/C#, Selenium/Playwright | **GitHub** (Repository) |
