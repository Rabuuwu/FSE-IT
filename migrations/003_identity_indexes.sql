-- Abort rather than silently merge two historical identities differing only by case.
-- Resolve reported case collisions on a copy before retrying this migration.
CREATE UNIQUE INDEX users_email_normalized_idx ON users(lower(email));
CREATE INDEX users_role_idx ON users(role_id);
CREATE INDEX resources_owner_idx ON resources(owner_id);
CREATE INDEX articles_author_idx ON articles(author_id);
CREATE INDEX courses_author_idx ON courses(author_id);
-- The existing unique(course_id,stage_number) already indexes the stages' foreign key.
