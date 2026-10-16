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

## Shared catalogue

| Route | Access | Behavior |
| --- | --- | --- |
| `GET /materials?q=&tag=&type=&page=1&limit=20` | Signed in | `{items,total,page,limit}`. Keyword search matches title/description/author. Exact normalized tag; type link/pdf/article/course. Limit 1–100; stable newest-first ordering. Bodies omitted from list. |
| `GET /tags` | Signed in | `{tags:[name,...]}` for visible materials only. |
| `GET /materials/:id` | Signed in, visible record | Material with body, stages and `my_rating`. |
| `POST /materials` | Admin | Create atomically with tags/stages; 201 `{id}`. |
| `PUT /materials/:id` | Admin | Full replacement, requires current integer `revision`; 200 `{id}`. Concurrent edits fail with 409. Reload deliberately before retrying. |
| `DELETE /materials/:id` | Admin | 204; stages, tag assignments, ratings and views cascade. |

Visibility: published records are visible to all signed-in users. Admin sees drafts; the original creator may read their own draft. Drafts are excluded from other users' lists, tag lists, details, activity training and recommendations. Old content is migrated as drafts.

Write body:

```json
{
  "type": "article",
  "title": "Python basics",
  "description": "A practical introduction",
  "author": "Material author",
  "tags": ["python", "backend"],
  "published": true,
  "content": "# Introduction\nStart here.",
  "stages": [],
  "revision": 1
}
```

`revision` is needed only on update; `url` is required for link/pdf (HTTPS, no URL credentials); `content` is required for article; course requires 1–100 stages `{title,content}`. Titles ≤200, descriptions ≤2000, author ≤200, content per article/stage ≤200000 characters. Maximum 20 tags, each ≤40 characters; trim, lowercase, deduplicate. Imported historical titles retain original lengths. Request size is capped at 2 MB. Raw HTML is displayed as text; the renderer supports headings, bold, inline and fenced code, and paragraphs.

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

`/resources` remains a private legacy store with GET/POST/DELETE; `/admin/resources` is an admin-only legacy listing. Original `/articles` and `/courses` GET endpoints read the archived tables with owner/admin/publication filtering; POST/PUT/DELETE return 410. The shared catalogue is canonical for editing and publishing; archived read endpoints are not synchronized with its later edits. Old page URLs redirect to the shared catalogue. No reset endpoint is provided.

`GET /health` is process liveness; `GET /ready` checks database connectivity and latest migration. ML has `GET /health`. No healthcheck should be used to bypass a free provider's idle policy.
