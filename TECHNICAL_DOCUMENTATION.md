# FSE-IT — technical documentation

Implementation date: 2026-10-16. The code is prepared locally; full database/browser verification and remote deployment are pending. See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for current evidence and remaining gates.

## Components

- Static HTML/CSS/JavaScript catalogue and authentication pages, built into `dist/` by `scripts/build-frontend.js`. Existing dashboard/admin/creator/viewer page URLs redirect to the shared interface.
- Express API in `coreFSE.js` exports `createApp(database, env)` separately from startup. `server/catalog.js` implements shared catalogue, tags, ratings, activity and recommendations. `server/validation.js`, `server/security.js`, and `auth.js` handle input, request boundaries and current-account authorization.
- PostgreSQL with explicit versioned migrations, recorded in `schema_migrations`; no DDL runs during normal application startup.
- Independent Python FastAPI service in `ml/app.py` with sparse TF-IDF/cosine content recommendation model in `ml/model.py`. The model uses the Python standard library rather than Pandas/scikit-learn to keep the first service small and permit independent deterministic tests.

## Data

`users` references `roles`. `materials` is the canonical catalogue, with external link/PDF, local article and course types, creator, content author, publication state and optimistic `revision`. `material_stages` preserves course order; normalized `tags` and `material_tags` support filtering. `ratings` has one current 1–5 score per user/material. `material_views` stores the latest view/click per user/material, deduplicated within 30 minutes and retained for 180 days.

Legacy `resources.data` remains private, unchanged. Articles, courses and stages are copied to shared catalogue drafts with original IDs mapped in `legacy_type`/`legacy_id`; originals remain archived. Catalogue changes do not update archived content endpoints. Deleting an account removes its private legacy content, ratings and views; shared catalogue content retains a null creator. No public reset endpoint exists.

## Access and rendering

JWT is signed with HS256 using a required secret of at least 32 characters. Each protected request reloads the account and role from the database. The browser stores its bearer token locally; expiry/deletion returns the user to login. Administrators create/edit/publish/delete catalogue content and list/delete other accounts; users browse, rate and receive suggestions. Drafts are visible only to admins and their original creator.

All catalogue content is escaped before rendering. The shared renderer accepts a limited Markdown subset and no raw HTML. External material URLs must use HTTPS without embedded credentials. API uses parameterized queries, bounded JSON input, configured CORS, per-process rate limits, production-safe error responses and verified database TLS. These implementation choices still require the real integration/E2E validation described below; they are not a completed security audit.

## Recommendations

Core calls the internal Python endpoint using `ML_SERVICE_TOKEN`. Python fetches a minimal, authenticated catalogue/history dataset from Core and has no database credentials. Only published metadata and the requested user's material IDs/ratings are supplied. The model weights viewed materials +1 and ratings score−3; repeated tag terms emphasize declared topics. Viewed/rated items are excluded. Core rechecks visibility and history after the model responds. Cold/unavailable ML uses a popularity fallback; responses distinguish personalized/popular/fallback modes. There is no cache to invalidate.

## Running, contracts and verification

- [Local setup and test commands](docs/LOCAL_SETUP.md)
- [API contract and permissions](docs/API.md)
- [Migration, deployment, provider constraints and rollback](docs/DEPLOYMENT.md)
- [Implementation checklist and work log](docs/IMPLEMENTATION_PLAN.md)

Only unit/model tests, syntax checks and static build have passed locally. Real PostgreSQL integration, browser E2E, migration/restore rehearsal, dependency lockfile and target hosting verification remain pending. GitHub Actions configuration runs the intended real-stack checks after the changes are pushed; no workflow run is claimed here.
