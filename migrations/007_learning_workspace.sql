ALTER TABLE materials ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE materials ADD COLUMN content_version integer NOT NULL DEFAULT 1;
CREATE TABLE learner_materials (
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 bookmarked boolean NOT NULL DEFAULT false,
 dismissed boolean NOT NULL DEFAULT false,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=10000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,material_id)
);
CREATE INDEX learner_materials_material_idx ON learner_materials(material_id);
CREATE TABLE learning_progress (
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 content_version integer NOT NULL,
 position integer NOT NULL CHECK(position>=0),
 completed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,material_id,content_version,position)
);
CREATE INDEX learning_progress_material_idx ON learning_progress(material_id);
CREATE TABLE material_reports (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 user_id integer REFERENCES users(id) ON DELETE SET NULL,
 comment_id bigint REFERENCES material_comments(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
 resolved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX material_reports_queue_idx ON material_reports(resolved,created_at);
CREATE INDEX material_reports_material_idx ON material_reports(material_id);
CREATE INDEX material_reports_user_idx ON material_reports(user_id);
CREATE INDEX material_reports_comment_idx ON material_reports(comment_id);
CREATE TABLE moderation_events (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 material_id integer REFERENCES materials(id) ON DELETE CASCADE,
 actor_id integer REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL,
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_events_material_idx ON moderation_events(material_id,id);
CREATE INDEX moderation_events_actor_idx ON moderation_events(actor_id);
CREATE TABLE notifications (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 material_id integer REFERENCES materials(id) ON DELETE CASCADE,
 message text NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_owner_idx ON notifications(user_id,id DESC);
CREATE INDEX notifications_material_idx ON notifications(material_id);
CREATE TABLE user_preferences (
 user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 interests text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE learning_paths (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 created_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learning_paths_owner_idx ON learning_paths(created_by);
CREATE TABLE learning_path_items (
 path_id integer NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
 material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position>=0),
 PRIMARY KEY(path_id,material_id), UNIQUE(path_id,position)
);
CREATE INDEX learning_path_items_material_idx ON learning_path_items(material_id);
CREATE TABLE material_quizzes (
 material_id integer PRIMARY KEY REFERENCES materials(id) ON DELETE CASCADE,
 version integer NOT NULL DEFAULT 1,
 questions jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE quiz_attempts (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 material_id integer NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 version integer NOT NULL,
 correct integer NOT NULL, total integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_attempts_owner_idx ON quiz_attempts(user_id,id DESC);
CREATE INDEX quiz_attempts_material_idx ON quiz_attempts(material_id);
