ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD CONSTRAINT users_display_name_length_check
    CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80);

CREATE TABLE material_comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX material_comments_material_created_idx
    ON material_comments(material_id, created_at, id);
