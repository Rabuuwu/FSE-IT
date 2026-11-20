# FSE-IT — technical documentation

Updated 2026-11-20. Static HTML/CSS/JavaScript, Express Core, PostgreSQL, independent Python/FastAPI recommendation service. No framework rewrite or cloud-only dependency.

## Services and ownership

Core authenticates Bearer JWTs, reloads account role/session version and checks revoked token digests on each protected request. Every login has a unique token ID. Ordinary logout revokes that token; logout-all/password reset/password change invalidate all account sessions. Browser bearer storage remains localStorage; this is not a migration to HttpOnly cookies. Rendering escapes untrusted content. Proxy trust is explicit; rate budgets remain per-process and need verified deployment settings.

Users create private materials and submit them to administrators. The shared catalogue is canonical; external resources/PDFs remain HTTPS links. Direct PUT retains the original unpublish-on-edit contract. The browser editor uses a separate private revision for published content; admin approval archives the previous snapshot and atomically replaces content. Revision conflicts return409. Publication version changes reset the *effective* progress, retaining old progress history.

## New data domains

- `learner_materials`: owner-scoped bookmarks, private notes, recommendation dismissals.
- `learning_progress`: user/material/content-version/stage completion, never inferred from a view.
- `learning_paths`/items: private ordered collections, only published items visible.
- `material_quizzes`/`quiz_attempts`: explicit admin publication, server grading, private attempts. Practice quizzes allow repeats and reveal feedback after submission.
- `material_reports`, `moderation_events`, `notifications`: reporting, audit and private author feedback.
- `material_revisions`, `material_versions`: unpublished replacement draft and archived publications, restricted to owner/admin.
- `account_actions`: hashed expiring action tokens, AES-GCM encrypted outbound message, delivery status.
- `revoked_tokens`: SHA-256 digest and token expiration.

Migrations001–009 are explicit, transactionally applied by `npm run migrate`; readiness requires every version. They never publish old private content. New foreign keys cascade private user data or preserve appropriate public attribution semantics. Private legacy JSON is preserved and included in own-data export; no destructive legacy conversion is performed.

## Mail

Optional Gmail HTTPS transport, durable encrypted outbox, one message per five-second polling iteration while Core is running. Sending happens outside database transactions. Claim uses SKIP LOCKED. There is no automatic retry after uncertain delivery: request a new link. Interrupted `sending` states and free-host sleep require operator/user awareness. See [MAIL_SETUP.md](docs/MAIL_SETUP.md). No live mail delivery verified here.

## Recommendations

Core passes only published material metadata and the authenticated user's minimal activity/preferences to ML. Python builds sparse TF-IDF/cosine vectors with tag emphasis and weighted ratings; declared interests initialize the profile. Dismissed items are excluded both in the dataset and final Core response. Timeout/failure uses popularity fallback. No claim of improved real-user learning outcomes: representative ranking evaluation remains open.

## Verification and limits

See [PRODUCT_EXPANSION.md](docs/PRODUCT_EXPANSION.md) for exact evidence. Unit/model tests, syntax, static build and isolated npm ci pass. New PostgreSQL integration/restore/E2E cases are written but blocked here by macOS sandbox shared-memory restrictions. Run `bash scripts/test-product.sh` in the normal terminal. No production DB, migration, deployment or external email was changed in this session.

Current scope does not include paid features, certificates, mobile apps, live chat, AI assistants, code execution, file hosting, shared rate limits across replicas, automatic destructive legacy migration, rich-text editing, or a measured recommendation benchmark.
