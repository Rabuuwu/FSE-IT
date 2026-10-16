# Local setup and verification

Requires Node.js 22+, npm, Python 3.12, PostgreSQL 17 (or Docker for the supplied local database). Run commands from the repository root.

## Start a fresh local environment

1. Copy `.env.example` to `.env`; set `JWT_SECRET` and `ML_SERVICE_TOKEN` to independent random values at least 32 characters long. Generate each with `python3 -c 'import secrets; print(secrets.token_hex(32))'`. Never commit `.env`.
2. Start `docker compose up -d db`, or create an equivalent local PostgreSQL database and set `DATABASE_URL`.
3. Run `npm install`. First online execution must generate/review/commit `package-lock.json`; then use `npm ci`. Direct dependency versions are pinned, but the complete transitive dependency graph is not yet locked.
4. On an existing database first follow [DEPLOYMENT.md](DEPLOYMENT.md), including a tested backup. On a fresh local database run `npm run migrate`, then `npm run migration:report`.
5. Run `npm start` in one terminal. API readiness: `http://127.0.0.1:3000/ready`.
6. Run `python3 -m venv .venv`, activate it, then `python -m pip install -r ml/requirements.txt -r tests/requirements.txt`. Export the same `ML_SERVICE_TOKEN` and `CORE_INTERNAL_URL` in the ML terminal (Python does not load `.env` automatically). Start `python -m uvicorn ml.app:app --host 127.0.0.1 --port 8000`.
7. Run `npm run build` and `npm run serve:frontend`. Open `http://127.0.0.1:5500`. Publish only `dist/`; the build copies an allowlist of browser assets, never the server, migrations or `.env`.
8. Register an account in the browser. In the intended environment run `npm run admin -- registered-email`. Reopen the catalogue to see admin controls. All later accounts are regular users unless explicitly promoted.

Default API address is localhost on a local frontend and the existing Render URL otherwise. To target a different API, build with `FRONTEND_API_URL=https://your-api.example npm run build`. Configure the actual frontend origin in Core `CORS_ORIGINS`. CORS does not replace authentication.

## Tests

```sh
npm test
npm run test:ml
```

Integration tests require an explicitly separate database ending in `_test`; they create a random schema, migrate it, test HTTP against real PostgreSQL, and drop only that schema. They never fall back to the application `DATABASE_URL`:

```sh
TEST_DATABASE_URL=postgresql://fse:fse_local_only@127.0.0.1:5432/fse_test npm run test:integration
```

Create `fse_test` separately (for the supplied container: `docker compose exec db createdb -U fse fse_test`). The test role must be able to create schemas in that database. E2E uses real Core, ML and database; run only on a dedicated demonstration/test instance because it creates accounts and materials:

```sh
python -m playwright install chromium
E2E_ADMIN_EMAIL=admin@example.com E2E_ADMIN_PASSWORD=your-test-password python tests/e2e.py
```

`E2E_FRONTEND_URL` and `E2E_API_URL` override localhost. CI creates the admin in an isolated test database using `scripts/create-ci-admin.js`, starts all three services, waits for readiness, and runs E2E. Browser traces, mobile screenshot and service logs are collected in ignored `artifacts/`.

## What was actually verified on 2026-10-16

- Found usable Node.js v24.21.0 bundled with the installed Python Playwright driver; shell PATH has no normal Node/npm installation.
- Seven Node tests passed: credentials and bcrypt byte limit, catalogue validation, IDs/pagination, escaped Markdown, commit and rollback behavior, and verified production database TLS.
- Six Python model tests passed: interest matching vs popularity, negative ratings, duplicate activity, empty/small catalogue, deterministic ordering and removed resources.
- JavaScript syntax and Python compilation were checked; frontend static build completed.
- No PostgreSQL server, Docker, npm dependencies or `.env` were available. DNS lookup for `registry.npmjs.org` failed. Integration suite correctly refused to run without `TEST_DATABASE_URL`; it has not passed against a real database here.
- Local Chrome launch under Playwright terminated with SIGABRT. Full E2E and visual/mobile checks have not run here. The CI workflow is prepared but has not been executed or pushed.

Do not treat syntax checks and unit tests as evidence that migration or full deployment is ready. Complete real integration/E2E, lockfile review, restore rehearsal and target configuration before a production release.
