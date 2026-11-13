CREATE TABLE records (
	entity TEXT NOT NULL,
	id TEXT NOT NULL,
	rev INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	deleted_at INTEGER,
	data TEXT NOT NULL,
	PRIMARY KEY (entity, id)
) STRICT;
CREATE INDEX records_rev ON records(rev, entity, id);

CREATE TABLE sync_batches (
	seq INTEGER PRIMARY KEY,
	batch_id TEXT NOT NULL UNIQUE,
	device_id TEXT NOT NULL,
	received_at INTEGER NOT NULL,
	ack TEXT NOT NULL
) STRICT;

CREATE TABLE devices (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	token_hash TEXT NOT NULL,
	token_issued_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL,
	revoked_at INTEGER
) STRICT;

CREATE TABLE link_codes (
	code_hash TEXT PRIMARY KEY,
	created_by TEXT NOT NULL REFERENCES devices(id),
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER
) STRICT;

CREATE TABLE push_subscriptions (
	endpoint TEXT PRIMARY KEY,
	device_id TEXT NOT NULL REFERENCES devices(id),
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE reminder_state (
	session_id TEXT PRIMARY KEY,
	last_sent_at INTEGER NOT NULL,
	sent_count INTEGER NOT NULL
) STRICT;

CREATE TABLE meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
) STRICT;
