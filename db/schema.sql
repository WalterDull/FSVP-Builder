-- FSVP Builder schema. Run automatically on boot (see db/migrate.js) and
-- also invoked by `npm run migrate`. Uses IF NOT EXISTS everywhere so it's
-- safe to run repeatedly (mirrors PCP-Planner's `prisma db push` behavior:
-- make the database match this file, without destroying existing data).

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session store table required by connect-pg-simple (server-side sessions,
-- same approach as PCP-Planner: httpOnly/secure/SameSite cookies, session
-- data lives in Postgres, not in a client-readable JWT).
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
)
WITH (OIDS=FALSE);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
    ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

CREATE TABLE IF NOT EXISTS plans (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data                 JSONB NOT NULL,
  selected_sops        JSONB NOT NULL DEFAULT '[]',
  unlocked             BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at          TIMESTAMPTZ,
  stripe_session_id    TEXT,
  amount_paid_cents    INTEGER,
  dev_unlock           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);

CREATE TABLE IF NOT EXISTS storage_subscriptions (
  id                       SERIAL PRIMARY KEY,
  user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id   TEXT,
  active_until             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_subs_user_id ON storage_subscriptions(user_id);
