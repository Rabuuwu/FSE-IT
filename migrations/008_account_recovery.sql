ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
CREATE TABLE revoked_tokens (
 digest text PRIMARY KEY,
 expires_at timestamptz NOT NULL
);
CREATE INDEX revoked_tokens_expiry_idx ON revoked_tokens(expires_at);
CREATE TABLE account_actions (
 digest text PRIMARY KEY,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 email text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,purpose)
);
CREATE INDEX account_actions_expiry_idx ON account_actions(expires_at);
ALTER TABLE account_actions ADD COLUMN encrypted_message text;
ALTER TABLE account_actions ADD COLUMN delivery_status text NOT NULL DEFAULT 'queued' CHECK(delivery_status IN ('queued','sending','accepted','failed'));
ALTER TABLE account_actions ADD COLUMN delivery_error text;
