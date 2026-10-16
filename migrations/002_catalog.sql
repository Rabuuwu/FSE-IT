-- Existing author content stays private. The original tables and JSON remain intact.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
CREATE TABLE materials (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_by integer REFERENCES users(id) ON DELETE SET NULL,
    type text NOT NULL CHECK (type IN ('link','pdf','article','course')),
    title text NOT NULL CHECK (length(title) >= 1),
    description text NOT NULL DEFAULT '',
    author text NOT NULL DEFAULT '',
    url text,
    content text,
    published boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 1,
    legacy_type text,
    legacy_id integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (legacy_type, legacy_id),
    CHECK ((type IN ('link','pdf') AND url LIKE 'https://%') OR (type IN ('article','course') AND url IS NULL))
);
CREATE INDEX materials_creator_idx ON materials(created_by);
CREATE INDEX materials_published_idx ON materials(created_at DESC, id DESC) WHERE published;
CREATE TABLE material_stages (
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position >= 0),
    title text NOT NULL,
    content text NOT NULL,
    PRIMARY KEY(material_id, position)
);
CREATE TABLE tags (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE CHECK (name = lower(name) AND length(name) BETWEEN 1 AND 40)
);
CREATE TABLE material_tags (
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    tag_id integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY(material_id, tag_id)
);
CREATE INDEX material_tags_tag_idx ON material_tags(tag_id, material_id);
CREATE TABLE ratings (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, material_id)
);
CREATE INDEX ratings_material_idx ON ratings(material_id);
CREATE TABLE material_views (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    viewed_at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL CHECK (kind IN ('view','click')),
    PRIMARY KEY(user_id, material_id)
);
CREATE INDEX material_views_material_idx ON material_views(material_id);
-- Keep a single latest view per user/material, with 180-day retention enforced by maintenance.
-- Copy local articles/courses as drafts, preserving originals and explicit ID mapping.
INSERT INTO materials(created_by,type,title,description,author,content,legacy_type,legacy_id,created_at,updated_at)
SELECT a.author_id,'article',a.title,coalesce(a.summary,''),'',a.content,'article',a.id,coalesce(a.created_at,now()),coalesce(a.updated_at,a.created_at,now()) FROM articles a;
INSERT INTO materials(created_by,type,title,description,author,legacy_type,legacy_id,created_at,updated_at)
SELECT c.author_id,'course',c.title,coalesce(c.description,''),'','course',c.id,coalesce(c.created_at,now()),coalesce(c.updated_at,c.created_at,now()) FROM courses c;
INSERT INTO material_stages(material_id,position,title,content)
SELECT m.id,s.stage_number-1,s.title,s.content FROM course_stages s JOIN materials m ON m.legacy_type='course' AND m.legacy_id=s.course_id;
-- resources.data is deliberately not guessed or published. Use npm run migration:report.
