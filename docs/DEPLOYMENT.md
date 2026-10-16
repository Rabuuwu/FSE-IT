# Release, migration and recovery

Status on 2026-10-16: local implementation and deployment assets prepared. No remote environment was changed. Actual provider accounts, database, domains and existing production data have not been inspected. Integration/E2E and restore rehearsal remain release gates.

## Provider feasibility

Verified official documentation on 2026-10-16:

| Component | Candidate | Verified constraint and implication |
| --- | --- | --- |
| Core Node API | Render Free | Sleeps after 15 idle minutes; wake-up about one minute. Workspace shares 750 instance-hours/month. Two continuously active services would exceed that allowance. Free instances are intended for previews/hobby use, not production reliability. [Render documentation](https://render.com/docs/free) |
| Database | Neon Free | Published plan: 100 CU-hours/project, 1 GB/project, 5 GB public transfer/project; scale-to-zero after 5 minutes. Keep connection pools small and budget compute/transfer for actual traffic. [Neon plans](https://neon.com/docs/introduction/plans) |
| Frontend | Static host supporting HTTPS and auth UI | `dist/` is provider-independent. GitHub Pages documentation discourages sensitive transactions such as passwords, so it is not selected for this login frontend. Existing Netlify address is a configuration hint, not a verified active deployment or confirmed free allowance. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) |
| ML | Separate Python ASGI/container host | `ml/Dockerfile` and uvicorn entrypoint provided. No fourth free platform has been selected and validated. Running both APIs on Render would need an explicit exception to the original different-platform requirement and a shared-hours budget. |

Free Render PostgreSQL expires after 30 days and is unsuitable as the permanent database here. Do not assume README's historical provider suggestions meet today's limits. The full four-platform zero-cost design is still unconfirmed. Do not activate paid plans to close that gap.

## Prepare a release

1. Complete `npm install` online, review the generated lockfile and dependency audit, commit the lockfile, then change CI/build commands to `npm ci`. Resolve material audit findings before release.
2. Run unit/model, real PostgreSQL integration and real-stack E2E from [LOCAL_SETUP.md](LOCAL_SETUP.md). Inspect browser trace, keyboard behavior and mobile screenshot. CI configuration alone is not evidence of a passing run.
3. Inventory actual production schema, case-colliding emails, account roles and private resources without writing secrets to logs. Compare with baseline migration assumptions: `users.role_id`, `roles.name`, and legacy article/course tables.
4. Snapshot or export production data. The following is a manual template, not a command already run:

```sh
mkdir -p backups
pg_dump --dbname="$DATABASE_URL" --format=custom --file=backups/pre-migration.dump
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-privileges backups/pre-migration.dump
```

`RESTORE_DATABASE_URL` must identify a separate empty database. Restrict backup permissions/storage; dumps include personal and authentication data. Never commit dumps. Verify counts, representative article bodies, course ordering, private JSON and test authentication on the restored copy before considering the backup usable.

5. Run `npm run migrate` against the restored copy first, then `npm run migration:report`. Migrations 001 (baseline), 002 (catalogue copy), 003 (normalized email uniqueness and indexes) are serialized with a database advisory lock and applied transactionally once. The server refuses readiness without the final migration.
6. Original `resources.data` stays private and intact. Original articles/courses and stages remain in legacy tables; catalogue records retain `legacy_type`/`legacy_id` and are drafts. Confirm counts, authors, full text and ordering. Review malformed private resource IDs separately. A case collision aborts migration 003 instead of merging identities; resolve on the copy before repeating any release procedure.
7. Review drafts and explicitly decide publication. Migration does not publish them. Record the accepted data mapping and any remediation.

## Deployment order and configuration

Use a maintenance window for the initial catalogue transition. Prevent content writes by the old application while taking the final backup/migrating; otherwise old writes could miss the one-time catalogue copy. Avoid overlapping deployment of incompatible versions.

1. Back up DB; run tested migrations as a controlled release step using the migration connection. Free Render does not provide a one-off shell/job, so run this from a trusted local/CI environment with intended DB credentials. Do not put migrations into the app's automatic startup.
2. Deploy ML: build context repository root, Dockerfile `ml/Dockerfile`, or install `ml/requirements.txt` and run `python -m uvicorn ml.app:app --host 0.0.0.0 --port "$PORT"`. Set `ML_SERVICE_TOKEN` (32+ random characters) and `CORE_INTERNAL_URL` to the real Core HTTPS origin. No database password is sent to ML.
3. Deploy Core using `render.yaml` or equivalent Node hosting. Set `DATABASE_URL`, `JWT_SECRET`, `ML_SERVICE_TOKEN` (same as Python), `ML_URL`, `CORS_ORIGINS` and optionally `DATABASE_CA`. Set `TRUST_PROXY_HOPS` only to the verified proxy hop count for the provider, so clients cannot forge rate-limiting addresses. Keep `PGPOOL_MAX` within the DB connection budget. Production requires TLS certificate verification; supply the appropriate CA rather than disabling verification.
4. Build frontend with the real `FRONTEND_API_URL=https://... npm run build`, publish only `dist/` to the selected static host, and allow its exact origin in Core CORS.
5. Run smoke tests of registration/login, current roles, catalogue search/tags, admin CRUD, publication, rating, recommendation personalization and fallback. Check that another user cannot see drafts. Check again after the Core/ML/DB idle periods.
6. Configure a daily maintenance task (or deliberate manual operation for a demo) running `npm run maintenance` to delete view rows older than 180 days. Query/model filtering already excludes expired views even before physical cleanup. Verify schedule execution and free-tier feasibility rather than assuming a cron product is free.
7. Record deployed commit, migration versions, actual URLs, provider limits, environment variable names and verification results. Never record secret values.

ML cold start has a 4-second Core deadline and a general-ranking fallback; Core frontend requests allow 65 seconds for the Core cold start. No mutation is automatically retried, preventing duplicate resource writes after an uncertain timeout. The current per-process rate limiter is suitable for one API instance; multiple replicas require a shared limiter.

## Rollback and recovery

- Before public writes begin, stop affected services, revert code/frontend to the recorded previous commit, and point them to the tested pre-migration copy (or restore a dump to a separate DB and switch the connection). Verify old login and private data before reopening.
- Do not run `DROP` or automatic down-migrations on the live database. Legacy tables are retained, but new catalogue edits are not mirrored back; reverting code alone would hide new work.
- After new writes begin, prefer a forward fix. A full restore loses changes after the backup. Export/reconcile those changes with a deliberate mapping before switching databases; document the recovery point.
- The catalogue retains shared material content when deleting its creator (`ON DELETE SET NULL`). Account/private-data deletion cannot be undone by reverting code; restoration needs a backup and a deliberate privacy/data decision.
- Rehearse restore and rollback on the isolated copy and record duration/result before marking the release gate complete.
