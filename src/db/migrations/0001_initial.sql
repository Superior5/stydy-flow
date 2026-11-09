CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, timezone TEXT NOT NULL, plan_handled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),original_date TEXT NOT NULL,scheduled_date TEXT NOT NULL,completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS topics_user_date ON topics(user_id,scheduled_date);
CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,title TEXT NOT NULL,url TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS resources_topic ON resources(topic_id);
CREATE TABLE IF NOT EXISTS transfers (id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,from_date TEXT NOT NULL,to_date TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('auto','manual')),created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS transfers_topic ON transfers(topic_id);
CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
