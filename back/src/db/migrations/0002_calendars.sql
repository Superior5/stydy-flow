CREATE TABLE calendars (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 is_public INTEGER NOT NULL DEFAULT 0,
 is_default INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX calendars_owner ON calendars(owner_id);
ALTER TABLE topics ADD COLUMN calendar_id TEXT REFERENCES calendars(id) ON DELETE CASCADE;
ALTER TABLE topics ADD COLUMN plan_date TEXT;
INSERT INTO calendars(id,owner_id,title,is_public,created_at)
 SELECT 'personal-' || id,id,'Мой учебный план',0,created_at FROM users;
UPDATE topics SET calendar_id='personal-' || user_id, plan_date=scheduled_date;
CREATE INDEX topics_calendar ON topics(calendar_id,plan_date);
CREATE TABLE topic_progress (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
 completed_at TEXT,
 PRIMARY KEY(user_id,topic_id)
);

