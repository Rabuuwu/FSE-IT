# ADR 007: Account ownership and session revocation

Status: implemented locally, 2026-10-22.

Account settings use the authenticated subject only, never a caller-supplied user ID or role. Profile writes have an explicit field allowlist. Changing email requires the current password; names may be cleared to NULL. Password changes require the current password and the existing bcrypt length/byte policy. Sensitive account writes share the strict authentication rate budget, including case and trailing-slash aliases. PATCH is explicitly included in CORS preflight methods.

Migration006 adds a nonnegative `users.session_version` counter. Login signs the current version into the JWT; authentication compares it to the current database value. Old tokens without the claim represent version0, preserving existing sessions until rotation. Password replacement increments the counter atomically, invalidating all sessions including the caller. No secret/password hash is returned. Protected writes recheck the session and current password under a row lock to avoid authorizing stale in-flight requests.

Self-deletion requires password and the exact confirmation phrase `USUŃ KONTO`. One transaction removes unpublished owned materials and the account; existing foreign keys remove resources/activity/comments and detach the creator of published shared material. Public content, including author text, is retained and the UI explicitly states this. This does not promise removal of identity already written inside published content. The final administrator cannot be deleted. Self-deletion and administrative deletion lock the admin role row before checking the administrator count, serializing competing checks.

The account dropdown is a disclosure containing ordinary navigation links, not an ARIA application menu. It supports button activation, Escape with focus return, outside click and leaving the widget with Tab. Header email text is replaced by a user icon; account identity is available inside the dropdown. Account settings are a static frontend page backed by Core APIs, with no additional service or dependency.

Trade-offs: token verification continues to require a database lookup; password changes deliberately require logging in again. Email delivery/verification, password recovery and uploaded avatars are not implemented by this change.
