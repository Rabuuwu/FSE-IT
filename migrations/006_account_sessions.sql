-- Token version 0 preserves existing sessions until the first password rotation.
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0
    CHECK (session_version >= 0);
