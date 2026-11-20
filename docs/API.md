# FSE-IT API contract

Base URL: configured by `FRONTEND_API_URL` at frontend build time. JSON requests and responses; errors have `{ "error": "message" }`. Protected routes require `Authorization: Bearer <JWT>`. Invalid input: 400; missing/invalid/deleted identity: 401; insufficient role: 403; inaccessible material: 404; duplicate email or stale revision: 409; superseded write endpoint: 410; rate limit: 429. Server errors do not include internal details in production.

## Identity

| Route | Access | Behavior |
| --- | --- | --- |
| `POST /register` | Public, rate limited | `{email,password}` → 201 `{id,email,created_at}`. Lowercase email, password 10+ characters and at most 72 UTF-8 bytes. Always creates User. |
| `POST /login` | Public, rate limited | `{email,password}` → `{token}`. Historical shorter passwords can still log in. |
| `GET /me` | Signed in | `{user:{user_id,email,role}}`; current DB identity and role are checked for every protected request. |
| `GET /users` | Admin | User list without password hashes. |
| `DELETE /users/:id` | Admin | Deletes another account and its activity/private legacy data; shared materials retain content and lose creator association. Cannot delete own account. |

Admin promotion is an explicit administrative command: `npm run admin -- email`. There is no public promotion endpoint. Tokens use HS256, expire after `JWT_EXPIRES_IN`, and cannot retain revoked roles.

## Own account

All account routes require a current authenticated session and select the account exclusively from that session. Client-supplied IDs, roles and unknown fields are rejected.

| Route | Body | Result |
| --- | --- | --- |
| `GET /account` | — | `{user:{user_id,email,display_name,role}}`, without password/session internals. |
| `PATCH /account` | `{display_name?,email?,current_password?}` | Updated public account fields. Names up to80characters; empty clears the name. Email normalized and unique; changing it requires current password. |
| `PUT /account/password` | `{current_password,new_password}` | Requires a different valid password (10+characters, at most72UTF-8bytes). Revokes every session including caller; sign in again. |
| `DELETE /account` | `{current_password,confirmation:"USUŃ KONTO"}` | 204. Deletes own unpublished materials and account, cascades private resources/activity/comments; published material remains without account association. Public author/content text is retained. Last administrator409. |

Missing/invalid input400; incorrect current password403; conflicting email or last administrator409; expired/revoked session401. Sensitive writes share20/minute authentication budget. Transactions lock the current account and revalidate session/password before mutation. Migration006 and JWT session version prevent old tokens from authorizing actions after a password change. Legacy tokens without the claim represent version0 until rotation. Readiness/startup require006. There is no public endpoint for changing another account or assigning roles. Email verification and recovery use the separate endpoints in the product expansion section.

## Shared catalogue and moderation

| Route | Access | Behavior |
| --- | --- | --- |
| `GET /materials?q=&tag=&type=&page=1&limit=20&scope=published` | Public | `{items,total,page,limit}`. Public scope excludes drafts even for their owners; default `scope=all` also includes the signed-in owner's drafts/admin previews. Anonymous reads always exclude unpublished records. Bodies omitted. |
| `GET /tags` | Public | Tags belonging to visible materials only. |
| `GET /materials/:id` | Public or owner/admin preview | Body, stages and `my_rating`; inaccessible record returns 404. |
| `GET /materials/:id/comments` | Public, published record | Paginated comments; writing requires authentication. |
| `GET /creators/:id` | Public | Public display name and published materials, without email/password. |
| `POST /materials` | Signed in | Create private, atomically with tags/stages; 201 `{id,revision,publication_status}`. |
| `PUT /materials/:id` | Owner/admin | Full replacement with current integer `revision`; always becomes private and clears review metadata. |
| `DELETE /materials/:id` | Owner/admin | 204; relations cascade. |
| `GET /materials/mine?status=&page=1` | Signed in | Own records, status counts and pagination. Empty status means all. |
| `POST /materials/:id/submit` | Owner/admin | `{revision}`; private/rejected → pending. |
| `POST /materials/:id/withdraw` | Owner/admin | `{revision}`; pending/published/rejected → private. |
| `GET /admin/overview` | Admin | User count, material count and counts per publication state. |
| `GET /admin/materials?status=pending&page=1` | Admin | Moderation queue; empty status means all records. |
| `POST /admin/materials/:id/review` | Admin | `{revision,decision:"approve"|"reject",note}`; pending → published/rejected. Rejection requires a nonempty note, up to 2000 characters. |

Missing authentication returns 401 and insufficient admin role 403. Non-owner draft access/mutation returns 404. Stale revisions and invalid state transitions return 409. Existing-row content/state mutations lock the material row in a transaction; clients must reload before resolving conflicts. Approving twice cannot apply two decisions. Editing a public material immediately removes it from the public catalogue until it is submitted and approved again.

Write body:

```json
{
  "type": "article",
  "title": "Python basics",
  "description": "A practical introduction",
  "author": "Material author",
  "tags": ["python", "backend"],
  "content": "# Introduction\nStart here.",
  "stages": [],
  "revision": 1
}
```

`revision` is required on update, not creation. `published:true` or a non-private `publication_status` in a write payload is rejected, including for administrators. Publication requires a separate moderation decision. `url` is required for link/pdf (HTTPS without credentials); article requires content; course requires 1–100 `{title,content}` stages. Limits: title/author 200, description 2000, article/stage content 200000 characters; up to 20 tags of 40 characters. Tags are normalized, deduplicated and sorted. Total JSON request limit: 2 MB. Raw HTML is escaped by the renderer.

Migration 005 preserves previous publication choices. A separate explicitly authorized local operation published the 56 existing development materials after backup. Generic migration never makes private records public. New material creation always starts private.

## Activity and recommendations

| Route | Access | Behavior |
| --- | --- | --- |
| `POST /materials/:id/views` | Signed in, visible record | 204; published content only. Latest event per user/material, updates no more often than every 30 minutes. External link/PDF records a click; local content records a view. |
| `PUT /materials/:id/rating` | Signed in, published record | `{score:1..5}` → `{score}`. One rating per user/material, upsert. |
| `DELETE /materials/:id/rating` | Signed in, visible record | 204; removes only the current user's rating. |
| `GET /recommendations/me` | Signed in | `{mode,items}`. Up to five unseen/unrated published materials. Mode personalized/popular/fallback. |
| `GET /internal/recommendation-data/:id` | Shared service token | Minimal published metadata, aggregate ratings, and only requested user's material IDs/ratings. No identity details or other users' histories. |
| Python `GET /recommendations/{user_id}` | Shared service token | `{mode,items:[{id}]}`; only Core should call it. |

Core rechecks ML output against current publication and user history. Timeout/unavailable/invalid ML response uses catalogue popularity. Viewing history expires logically after 180 days; `npm run maintenance` physically removes expired rows. Ratings persist until changed, deleted, or the account/material is deleted. Model weights: unscored view +1; rating contributes score−3. TF-IDF uses tags (threefold frequency), title and description; cosine ranks against weighted interest profile. No model cache; changes are reflected on the next request. This is a small-catalogue model, not a measured production recommendation benchmark.

## Legacy compatibility and health

`/resources` remains a private legacy store with GET/POST/DELETE; `/admin/resources` is an admin-only legacy listing. Original `/articles` and `/courses` GET endpoints read the archived tables with owner/admin/publication filtering; POST/PUT/DELETE return 410. The shared catalogue is canonical for editing and publishing; archived read endpoints are not synchronized with its later edits. Old page URLs redirect to the shared catalogue. Reset is provided by `/auth/reset/request` and `/auth/actions/confirm` (see below).

`GET /health` is process liveness; `GET /ready` checks database connectivity and latest migration. ML has `GET /health`. No healthcheck should be used to bypass a free provider's idle policy.

## Product expansion (007–009; 2026-11-20)

All endpoints below require Bearer authentication except `/auth/reset/request` and `/auth/actions/confirm`. Owner IDs are always taken from the authenticated identity. List endpoints use `page` and `limit` (1–100, default 20).

| Route | Contract |
| --- | --- |
| `GET /learning` | Own published learning items, bookmark/note, completed stage count and next stage. |
| `GET /learning/:id` | Own bookmark/dismissal/note and current-version progress. |
| `PATCH /learning/:id` | Optional `bookmarked:boolean`, `dismissed:boolean`, `note:string` (≤10000). |
| `PUT /learning/:id/progress` | `{position,completed,content_version}`; published course only, stale version409. |
| `GET/PUT /preferences` | `{interests:string[]}` up to20 tags. |
| `GET/POST /paths` | Private paths; create `{title,description,material_ids:[integer]}` (1–100 unique published IDs). |
| `GET/DELETE /paths/:id` | Own path only; unavailable materials omitted. |
| `GET /notifications` | Own messages; `PUT /notifications/:id/read` marks own notification read. |
| `POST /materials/:id/report` | `{reason,comment_id?}`; published material, matching comment. |
| `GET /admin/reports` | Admin unresolved queue; `PUT /admin/reports/:id/resolve`. |
| `PATCH/DELETE /comments/:id` | Edit own `{body}`; delete own or admin. |
| `GET /materials/:id/history` | Owner/admin moderation decisions and transitions. |
| `GET /materials/:id/quiz` | Published questions/options/version without answers or explanations. |
| `PUT /materials/:id/quiz` | Admin explicit publication: `{questions:[{text,options,answer,explanation}]}` up to30; new version. |
| `POST /materials/:id/quiz/attempts` | `{version,answers:[zero-based index]}`; server grading, feedback, saved attempt. Practice quiz permits repeats; no certificate/skill claim. |
| `GET /author/report` | Own material aggregates, never individual learners' identities. |
| `GET /account/export` | Own account, materials/stages, private legacy data, learning, paths, preferences, revisions, ratings, comments, attempts; no hashes/tokens or other users' data. |
| `GET/PUT /materials/:id/revision` | Owner/admin private next publication. PUT uses normal material payload, current material `revision` and existing `draft_revision` when present. |
| `POST /materials/:id/revision/submit` | `{revision}` is the draft revision. Keeps existing publication visible. |
| `GET /admin/revisions` | Admin pending publication revision queue, including draft payload for review. |
| `POST /admin/materials/:id/revision/review` | `{revision,decision,note}`; pending draft and unchanged base version required. |
| `GET /materials/:id/versions` | Owner/admin archived published snapshots (paginated). |
| `GET /account/email` | Verification, mail configuration and own latest active delivery status/error. |
| `POST /account/email/request` | Queue verification to current account email. |
| `POST /auth/reset/request` | `{email}`; generic202 for known/unknown/unverified addresses;503 when mail not configured. |
| `POST /auth/actions/confirm` | `{purpose:"verify"|"reset",token,password?}`; reset requires password; single-use/30minutes. |
| `POST /auth/logout` | Revoke current JWT digest server-side. |
| `POST /auth/logout-all` | Increment account session version, revoking all current sessions. |

Materials now accept `metadata:{level,language,minutes,prerequisites,technology_version,outdated}`. Level: empty/beginner/intermediate/advanced; duration null or1–10000; limits40/2000/100 for language/prerequisites/version. `GET /materials` adds `sort=newest|rating|relevance` (relevance prioritizes title matches). Comments and creator listings now paginate with default20.

The existing direct material PUT retains its unpublish-on-edit behavior for compatibility. The browser editor uses `/revision` for published material so publication is preserved. Course content_version increments on replacement; progress for older content remains private history, not current completion. Views never mark progress. Archived snapshots are not publicly exposed. Explicit interests influence Python TF-IDF profile; dismissed items are removed from both ML candidates and Core fallback/rechecks.
