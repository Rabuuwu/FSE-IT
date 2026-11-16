# Local setup and verification

Requires Node.js 22+, npm, Python 3.12, PostgreSQL 17 (or Docker for the supplied local database). Run commands from the repository root.

## Start a fresh local environment

After the one-time setup below, start the local stack with `npm run dev`. The launcher checks PostgreSQL 17, applies migrations, builds the frontend, then starts the API, ML service and static frontend. It reuses healthy services already listening on the expected local ports and refuses to start a duplicate on a port occupied by an unrelated process. API and ML started by the launcher restart automatically after source changes; reused services keep their existing behavior. Rebuild the static frontend with `npm run build`. Press `Ctrl+C` to stop processes started by the launcher. PostgreSQL is stopped on exit only if the launcher started it directly; a Homebrew service already running is left alone. Logs are written to a temporary directory shown at startup.

To fill the local catalogue, run `npm run seed:demo`. It is guarded to run only in development against the loopback database named `fse`; it applies pending migrations, creates 10 demo accounts, adds 50 new learning materials (56 in the complete sample set), and adds sample comments. Re-running it refreshes these known demo materials and their tags/course stages, preserves ratings and user comments, and does not delete unrelated user-created materials. Demo accounts use the password `FSE-Demo-2026!`; do not use them outside the local development database.

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

## What was actually verified on 2026-10-19

- Found usable Node.js v24.21.0 bundled with the installed Python Playwright driver; shell PATH has no normal Node/npm installation.
- Eight Node tests passed: credentials and bcrypt byte limit, catalogue validation, IDs/pagination, trusted-proxy hop validation, escaped Markdown, commit and rollback behavior, and verified production database TLS.
- Six Python model tests passed: interest matching vs popularity, negative ratings, duplicate activity, empty/small catalogue, deterministic ordering and removed resources.
- JavaScript syntax and Python compilation were checked; frontend static build completed. These checks were rerun on 2026-10-19.
- No PostgreSQL server, Docker, npm dependencies or `.env` were available. DNS lookup for `registry.npmjs.org` failed. Integration suite correctly refused to run without `TEST_DATABASE_URL`; it has not passed against a real database here.
- Local Chrome launch under Playwright terminated with SIGABRT. Full E2E and visual/mobile checks have not run here. The CI workflow is prepared but has not been executed or pushed.

Do not treat syntax checks and unit tests as evidence that migration or full deployment is ready. Complete real integration/E2E, lockfile review, restore rehearsal and target configuration before a production release.


## Isolated migration failure and restore rehearsal

The integration suite includes migration 003 → 004 readiness, an intentional constraint
collision in 004, rollback of the added column and migration ledger, then removal of
that test-only collision and a successful retry. It also checks simultaneous edits
(one 200, one 409), rating upsert and private-resource/rating isolation. These scenarios
must run against real PostgreSQL; in-memory API tests do not replace them.

For backup rehearsal, create two separate disposable databases whose names end in
`_test`. Install PostgreSQL client tools matching the server major version. Pass both
connection URLs explicitly (the runner never falls back to `DATABASE_URL`):

```sh
TEST_DATABASE_URL=postgresql://localhost/fse_backup_test \
TEST_RESTORE_DATABASE_URL=postgresql://localhost/fse_restore_test npm run test:restore
```

The runner creates a uniquely named schema containing synthetic fixtures, applies
migrations, dumps only that schema, first rejects a deliberately truncated archive with `--single-transaction` and checks
that no partial schema remains, retries the valid archive into the second database
without `--clean`, compares every table exactly, and verifies the restored password and
current-role authentication. It cleans up only its own schema and temporary archive.
It does not prove restoration of production data, provider roles or infrastructure.
The original sandbox blocked shared memory and local connections. After environment
access was restored, all 10 PostgreSQL integration scenarios and this restore rehearsal
passed on a fresh isolated PostgreSQL17 cluster; see `career-engineering-audit.md`.
Real-stack browser E2E and production/provider recovery remain separate gates.


## Material creation and moderation

The catalogue (`catalog.html`) can be browsed anonymously. Sign in and select **Dodaj materiał** to open `material-editor.html`. The four steps are description, content, tags and preview. Supported types: HTTPS link, HTTPS PDF URL, Markdown article and an ordered course. Binary upload/storage is not included.

1. **Zapisz prywatnie** stores a draft. It is visible to the author and administrators, not other users or guests.
2. **Przekaż do weryfikacji** submits the saved revision. Pending materials are still unpublished.
3. An administrator opens `admin.html`, selects **Sprawdź materiał** and reads the complete content/stages or follows the source URL. **Odrzuć do poprawy** requires a reason; **Zatwierdź i opublikuj** makes it available anonymously.
4. The author sees status and rejection notes on the separate **Moje materiały** page (`my-materials.html`), can edit/resubmit or withdraw content. Editing an approved/pending record makes it private. A stale revision returns 409; reload and reconcile changes deliberately.

The administrator panel also lists all material states, overview counts and users. Existing account removal safeguards remain in force. Do not use destructive account operations on real data for testing.

`npm run seed:demo` is a trusted fixture command restricted to the local development database `fse`: it intentionally publishes synthetic demo materials, synchronizes both publication fields and can replace fixture content. It is not part of normal authoring. Do not rerun it to fix moderation state.

The moderation E2E requires an isolated migrated database, synthetic administrator and separate API/frontend. `tests/e2e.py` uses `E2E_FRONTEND_URL`, `E2E_API_URL`, `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`; `E2E_CHROME_EXECUTABLE` optionally selects a browser. It uses installed macOS Chrome when present, otherwise Playwright's installed Chromium. Never run it against production: it creates an account and a synthetic material.

Regression sensitivity can be checked with `python3 tests/moderation-regression-sensitivity.py` with Node on PATH. It changes disposable copies only and expects tests to reject three deliberately broken implementations.

### Verified locally on 2026-10-22: moderation feature

- Node tests: 24/24; isolated PostgreSQL integration: 15/15 (five new migration/moderation scenarios). Python recommendation model: 6/6. Syntax/assets and frontend build passed; npm dependency audit reported zero known vulnerabilities.
- Chrome E2E on an isolated PostgreSQL17 + Core + Python ML + static frontend stack passed: mobile author creates private draft, anonymous reader receives404; author submits, admin rejects with note, author resubmits and admin approves; anonymous detail becomes200. All-material/status filters and user listing work; normal-user admin API403 and admin UI denial are checked.
- The same browser run verifies 5-star rating, personalized recommendation of related unseen content, search and mobile catalogue width. The initial runs caught a select naming problem and long-title mobile overflow; those product defects were fixed. A later test-only selector mismatch was corrected to the real search label. Final run passed.
- Row revision races, outsider BOLA mutations, forbidden direct publication and migration005 state/check preservation passed on disposable schemas. Three deliberate regressions (direct publication bypass, missing migration005 requirement and admin-role bypass) were detected in disposable source copies.
- Backup rehearsal compared all14tables after pg_dump/pg_restore, rejected a truncated archive atomically and retried successfully. This is synthetic recovery evidence, not production recovery.
- Local development `fse` was backed up privately before applying005. Exactly56existing materials were made public under the owner's explicit request. No production database, push or deployment was involved.

Raw local logs: `/private/tmp/fse-after-update-stsvvcjh/` (DB/tests/audit), `/private/tmp/fse-moderation-browser-zsmqelo6/` (final browser run). Browser trace and screenshots are ignored under `artifacts/`; the private local archive is ignored under `backups/`. Temporary test clusters were stopped. These paths are session evidence and may be removed by OS temporary-file cleanup.

If port3000 is used by another project, run `PORT=3010 npm run dev`. The local launcher builds the public frontend configuration and sets the ML callback to the selected API port. Frontend5500 and ML8000 remain unchanged. It does not stop unrelated processes. For the current manual test session, FSE-IT uses API3010 because DealQuill occupies3000.

The catalogue has one **Moje materiały** navigation entry leading to `my-materials.html`. It contains the author's materials with status filtering, edit/submission actions and earlier private saved resources in the same list. Historical `catalog.html#mine` and `catalog.html#private` links redirect there. No saved data is migrated or republished by this navigation change.

Separate-page verification: 24Node tests, syntax/assets (37JS), build and the extended isolated Core/ML/Chrome E2E passed. Chrome verified navigation from the catalogue, owner list/status filters and mobile width390. A separate read-only local browser check verified anonymous access guard, both old-anchor redirects and safely rendered earlier saved data using an intercepted synthetic resources response; no database records were created by that check. E2E logs: `/private/tmp/fse-moderation-browser-0dbdjh_q/`; screenshots: `artifacts/my-materials-mobile.png` and `artifacts/my-materials-local-mobile.png`.

## Personal dashboard

Every signed-in account opens `dashboard.html` after login. The dashboard shows only that account's `/materials/mine` status counts/recent materials and private `/resources`, with `/recommendations/me` proposals. It accepts no user ID selector. Administrators retain a personal dashboard and a separate administrative panel; personal totals do not include other authors' materials. Status shortcuts open the filtered `my-materials.html` page. Anonymous visitors see a sign-in prompt, expired sessions use the existing401 login flow. Data failures show retry actions and unknown counts rather than invented zeroes.

Dashboard verification: 24Node tests, syntax/assets (37JS), build and isolated Core/ML/Chrome E2E passed. E2E verified different personal totals for two accounts (author2, administrator0), role-appropriate navigation, recent records, mobile390 and status links. Local read-only Chrome smoke additionally verified anonymous denial, login redirect, independently failing/retrying summary and recommendations, unknown counts on errors and401session clearing. No live database data was changed by the smoke check. Evidence: `/private/tmp/fse-moderation-browser-yb07zjf_/`, `artifacts/dashboard-mobile.png` and `artifacts/dashboard-local-mobile.png`.

## Account menu and settings

The header user icon opens personal navigation: dashboard, own materials, account settings, password change, deletion, administrative panel (adminonly) and logout. It replaces the email header/persistent logout button; Escape returns focus to the icon. `account.html` contains profile, security and deletion sections. Email changes and deletion require current password. Password changes log out all sessions. Deletion requires the exact phrase `USUŃ KONTO` and removes unpublished material/private records while retaining published community content without a creator account. Last administrator deletion is rejected. No live account was changed for verification.

Migration006 adds the session counter without modifying passwords. The local development database was privately backed up before applying it; existing version0 sessions remain valid. The local launcher continues on API3010/frontend5500. Email delivery/verification, forgotten-password recovery and avatar uploads remain outside this feature.

Verification: 26Node tests, 20PostgreSQL integrations, synthetic14table backup/restore, syntax/assets40JS, build and dependency audit0 passed. Four deliberate regressions were detected, including bypassing session revocation. Chrome isolated full-stack E2E passed menu keyboard behavior, profile change/wrong-password rejection, password rotation and forced login, deletion cancel/confirmation and retained published content. Evidence: `/private/tmp/fse-after-update-tqlkq0c9/` and `/private/tmp/fse-moderation-browser-4h6ivfu7/`; screenshot `artifacts/account-mobile.png`.

Final read-only browser smoke on the running local app passed guest settings guard, icon-only header identity, dropdown dashboard/admin links, direct deletion-section navigation and cancellation, Escape/focus return and mobile390 across dashboard/catalogue/own materials/editor/admin. No live account or material was modified. Screenshot: `artifacts/account-menu-local-mobile.png`.

## SVG icons

UI symbols now use16Lucide icons downloaded from svgicons.com. Shapes are stored locally in `assets/icons/lucide.svg`; exact source pages and full upstream license notices are retained beside it. `icons.js` provides a fixed-name renderer, with decorative SVG hidden from assistive technology while existing button labels remain intact. The static build copies local assets; no third-party runtime/CDN is needed.

Verification:26Node tests, syntax/assets41JS, build and Chrome mobile390 passed. Chrome checked local sprite loading, visible SVG geometry, seven menu icons, catalogue type icons and guest rating interaction/accessibility labels. No content/account data changed. Screenshots: `artifacts/svgicons-menu-mobile.png`, `artifacts/svgicons-catalog-mobile.png`.

## Typography and contrast

Manrope500–800 is used for headings/brand/summary numbers; Source Sans3 400–700 for body, navigation, buttons and forms. Both are locally hosted variable WOFF2 fonts with Latin/Latin Extended subsets and Polish glyphs, `font-display:swap` and system fallbacks. The four files total128668bytes. Source URLs and complete SIL OFL license notices are in `assets/fonts/`. `css/fonts.css` loads the files; shared `css/theme.css` defines roles, readable tag sizing, contrast colors and a two-color keyboard-focus treatment. Existing page layout/branding remains intact.

Verification on the running local app: axe-core4.10.3 color-contrast scans across19guest/authenticated desktop/mobile states found10confirmed node failures before the change and0after. The initial tool could not evaluate overlapping small tags; increased text size/line spacing resolved those incomplete tag checks. Remaining automatic review cases were a decorative plus symbol (not meaningful text) and a native editor textarea, which remained an incomplete automated check even with text entered. Its computed colors were separately checked as opaque #18334b on #ffffff, with #637789 borders; it is not counted as an automated pass. These are contrast results, not a claim of complete WCAG conformance or an audit of every possible application state.

Independent WCAG luminance calculations for12specified text/control pairs passed their4.5:1text or3:1nontext thresholds. Examples: body/paper12.09:1, muted/paper6.42:1, primary button7.00:1, teal button6.82:1, placeholder6.12:1, control border4.64:1. Chrome DevTools confirmed actual custom Manrope and Source Sans3 rendering, not just CSS family declarations. Polish text coverage,320/390/1280px catalogue reflow,200percent text enlargement, a visible3pxkeyboard outline, frontend build/syntax and26Node tests passed. No account/material was changed.

Evidence (ignored local artifacts): `artifacts/contrast-before.json`, `artifacts/contrast-after.json`, `artifacts/typography-evidence.json`, `artifacts/typography-desktop-viewport.png`, `artifacts/typography-mobile-viewport.png` and `artifacts/typography-text-200.png`. Criteria: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum and https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast .
