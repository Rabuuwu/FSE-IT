# Render Core API deployment

The complete release procedure is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Do not deploy against existing data until a migration rehearsal, tested backup and full-stack checks pass.

`render.yaml` describes the Core service only. Build: `npm install` (switch to `npm ci` after generating/reviewing the lockfile). Start: `npm start`. Healthcheck: `/ready`. Automatic deployment is disabled so migrations remain a controlled release step.

Required environment:

```text
NODE_ENV=production
DATABASE_URL=<PostgreSQL URL>
JWT_SECRET=<32+ random characters>
ML_SERVICE_TOKEN=<32+ random characters, same as Python>
ML_URL=<Python HTTPS origin>
CORS_ORIGINS=<exact frontend HTTPS origin>
PGPOOL_MAX=5
```

`PORT` is supplied by Render. Optional settings: `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS` (10–15), `DATABASE_CA` and verified `TRUST_PROXY_HOPS`. Database TLS certificate verification is enabled in production.

Run the tested `npm run migrate` separately before starting this release. Build the frontend with `FRONTEND_API_URL=<Core HTTPS origin> npm run build`, and publish only `dist/`. Source configuration is `config.js` in the repository root.

Actual deployment URLs/accounts have not been verified. ML provider selection and the complete four-platform zero-cost arrangement are still pending; this file is not evidence of a deployed release.
