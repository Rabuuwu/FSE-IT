-- Preserve every existing publication choice; publishing legacy private data requires an explicit operator action.
ALTER TABLE materials
    ADD COLUMN publication_status text NOT NULL DEFAULT 'private',
    ADD COLUMN review_note text,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN reviewed_at timestamptz,
    ADD COLUMN reviewed_by integer REFERENCES users(id) ON DELETE SET NULL;
UPDATE materials SET publication_status = CASE WHEN published THEN 'published' ELSE 'private' END;
ALTER TABLE materials
    ADD CONSTRAINT materials_publication_status_check CHECK (publication_status IN ('private','pending','published','rejected')),
    ADD CONSTRAINT materials_publication_sync_check CHECK (published = (publication_status = 'published')),
    ADD CONSTRAINT materials_review_note_check CHECK (review_note IS NULL OR length(review_note) <= 2000);
CREATE INDEX materials_moderation_queue_idx ON materials(publication_status, submitted_at, id);
