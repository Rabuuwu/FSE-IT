CREATE TABLE material_revisions (
 material_id integer PRIMARY KEY REFERENCES materials(id) ON DELETE CASCADE,
 author_id integer REFERENCES users(id) ON DELETE SET NULL,
 base_version integer NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'private' CHECK(status IN ('private','pending','rejected')),
 payload jsonb NOT NULL,
 review_note text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX material_revisions_author_idx ON material_revisions(author_id);
CREATE INDEX material_revisions_queue_idx ON material_revisions(status,updated_at);
CREATE TABLE material_versions (
 material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 content_version integer NOT NULL,
 payload jsonb NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(material_id,content_version)
);
