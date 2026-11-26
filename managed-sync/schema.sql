CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, public_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)));
CREATE TABLE IF NOT EXISTS challenges (hash TEXT PRIMARY KEY, device TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS challenges_expiry ON challenges(expires);
CREATE TABLE IF NOT EXISTS device_approval_batches (revision TEXT PRIMARY KEY);
