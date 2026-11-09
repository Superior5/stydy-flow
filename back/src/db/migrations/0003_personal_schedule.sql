ALTER TABLE topic_progress ADD COLUMN scheduled_date TEXT;
ALTER TABLE topic_progress ADD COLUMN history TEXT NOT NULL DEFAULT '[]';
INSERT OR IGNORE INTO topic_progress(user_id,topic_id,completed_at,scheduled_date)
 SELECT user_id,id,completed_at,scheduled_date FROM topics;
UPDATE topic_progress SET scheduled_date=(
 SELECT CASE WHEN topics.user_id=topic_progress.user_id THEN topics.scheduled_date
 ELSE COALESCE(topics.plan_date,topics.scheduled_date) END
 FROM topics WHERE topics.id=topic_progress.topic_id
) WHERE scheduled_date IS NULL;
