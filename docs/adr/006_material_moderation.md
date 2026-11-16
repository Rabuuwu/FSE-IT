# ADR 006: Private drafts and explicit moderation

Status: implemented locally, 2026-10-22.

## Context

Users need to author learning materials without publishing unfinished content. An administrator must review each submitted revision before anonymous visitors can read it. Concurrent author edits and administrator decisions must not publish unreviewed content.

## Decision

Keep one material row and a four-state workflow: `private → pending → published|rejected`. Rejected materials can be resubmitted; owners can withdraw pending or published content. Every content update returns the record to private and clears review metadata. This deliberately removes the old public revision until a new review; retaining public snapshots would require version storage and is outside this scope.

All mutations of existing material content or state lock its row within the same transaction. Updates, submissions and decisions require the current integer revision. Stale requests return 409 without automatic retry. Repeated decisions cannot publish a later, unseen revision. Tags and course stages commit with content. The database CHECK keeps legacy `published` synchronized with `publication_status`.

Every authenticated user can create; owner or administrator can edit/delete; only current database administrators can decide. API payloads cannot set publication directly. Public reads use optional authentication with full verification when a token is supplied; anonymous and unrelated readers receive 404 for unpublished details. Recommendations include published materials only.

Migration 005 preserves prior private/public choices. Publishing existing private records is a separate, explicit operator action rather than an automatic migration side effect. The owner's request authorized publishing the existing 56 records in the local development database after a private backup; new records remain private.

## Consequences

No queue service, separate moderation service or new dependency is required. Review metadata retains the latest decision, not an immutable audit history. Administrators can preview private content; the UI states this explicitly. Uploaded binary files are outside this change: PDF and link materials use HTTPS URLs. Source URL suitability and ownership remain part of human review.
