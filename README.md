# FSE-IT

FSE-IT is an educational resource catalogue with accounts, a private material creator, administrator-reviewed publishing, search and tags, ratings, activity tracking, and personalized recommendations. Its frontend is static HTML/CSS/JavaScript; the Core API uses Node.js/Express and PostgreSQL; a separate Python service ranks recommendations.

## Current state

The header user icon opens personal navigation and account settings (profile, password rotation and confirmed self-deletion). Each account has a personal dashboard with own status counts, recent materials and learning proposals; login opens that dashboard. The repository implements a four-step material creator, private drafts, explicit submission, administrator review with rejection notes, public browsing without an account, search, ratings and recommendations. Content edits return a material to private; publication requires a new review. Administrator tools include moderation, material browsing, overview counts and account management.

Migration 005 adds the moderation workflow. Migration006 adds session revocation; startup/readiness require migrations001–006. It preserves previous publication choices. The owner's explicit local request separately published the 56 existing development materials after a private backup. New materials remain private. Generic migrations do not publish private content automatically.

Local PostgreSQL integration (20 scenarios), backup/restore, Node tests (26), Python model tests (6), real Chrome E2E with Core/ML, syntax checks, build and dependency audit have passed; see [verification evidence](docs/career-engineering-audit.md) and [local moderation verification](docs/LOCAL_SETUP.md#material-creation-and-moderation). A production/provider deployment and recovery rehearsal remain separate release requirements.

## Run locally

Use Node.js 22+, npm, Python 3.12+, and PostgreSQL 17. See [Local setup and verification](docs/LOCAL_SETUP.md) for environment variables, migrations, all three services, and the test commands. The short version for a fresh local database is:

```sh
cp .env.example .env
# Set independent JWT_SECRET and ML_SERVICE_TOKEN values in .env.
docker compose up -d db
npm install
npm run migrate
npm start
```

Start the Python recommendation API and build/serve the frontend in separate terminals as described in the setup guide. `npm install` is currently used because the repository does not yet contain a reviewed `package-lock.json`; commit and use the generated lockfile before treating installs as reproducible.

## Verification

```sh
npm test
npm run test:ml
npm run check
npm run build
```

Integration and E2E tests use a dedicated disposable test database and the real services. Follow the safety requirements in [Local setup and verification](docs/LOCAL_SETUP.md); do not point them at production data.

## Project documentation

- [Implementation status and remaining release work](docs/IMPLEMENTATION_PLAN.md)
- [Local setup and verification](docs/LOCAL_SETUP.md)
- [API contract](docs/API.md)
- [Deployment, backup, and recovery](docs/DEPLOYMENT.md)
