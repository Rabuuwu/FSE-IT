# ADR 005: share the API's required migration contract

Status: accepted; PostgreSQL17 integration passed on the isolated test cluster.

Creator profiles and comments access `users.display_name` and `material_comments`,
introduced by migration 004. Both startup and `/ready` previously accepted only 003,
so an instance could advertise readiness with an incompatible schema.

Use one small `schemaReady(database)` function listing the four required migrations.
Startup rejects missing migrations before opening a socket; `/ready` returns 503 on
missing migrations, a missing ledger or a query failure. Later migrations are allowed.
No migrations run during startup, and no automatic retry or schema repair is added.

Tests exercise the real `start` and `createApp` entrypoints with a controlled database.
The integration suite separately reproduces failed 004, transactional DDL rollback and
retry on an isolated schema. That suite passed after environment access was restored: failed004 rolled back DDL
and ledger, retry succeeded, readiness transitioned503→200. A migration ledger check does not
replace schema drift detection or end-to-end smoke tests.
