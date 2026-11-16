# ADR 004: Apply authentication limits to every equivalent Express route

Status: accepted locally, 2026-10-22.

## Context

Express routes are case insensitive and accept an optional trailing slash by default. The previous limiter compared `req.path` to literal `/login` and `/register`; `/LOGIN/` reached the same handler with the larger 300/minute API budget. Invalid JSON also failed before entering the limiter.

## Decision

Classify authentication paths with `/^\/(?:login|register)\/?$/i` and keep their existing shared 20/minute per-IP budget. Run the limiter before the 2 MB JSON parser. Preserve the separate 300/minute ordinary API budget and existing CORS checks. Do not change Express routing semantics, password policy or database authorization.

Four tests exercise actual Express routing, body parsing and security middleware through in-memory Node HTTP request/response objects. They require no listening socket or database and run with `npm test`.

## Consequences

The two previously failing regression scenarios now return 429 on attempt 21. Malformed requests still return 400 until the budget is exhausted. Limits remain process local and require correctly configured trusted proxies. Horizontal scaling would require a shared limiter or ingress policy; introducing Redis for a single instance is unjustified. Socket/TLS/proxy behavior still requires deployment integration tests.
