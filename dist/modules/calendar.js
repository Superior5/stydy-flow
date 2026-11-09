import { DateTime } from "luxon";
import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { topics, transfers } from "../db/schema.js";
export const localDate = (timezone, now = new Date()) => DateTime.fromJSDate(now, { zone: timezone }).toISODate();
/** One atomic jump records the full missed interval; subsequent syncs are no-ops. */
export function syncCalendar(c, userId, timezone, now = new Date()) {
    const today = localDate(timezone, now);
    return c.sqlite.transaction(() => {
        const overdue = c.db
            .select()
            .from(topics)
            .where(and(eq(topics.userId, userId), eq(topics.status, "pending"), lt(topics.scheduledDate, today)))
            .all();
        for (const topic of overdue) {
            c.db
                .insert(transfers)
                .values({
                id: randomUUID(),
                topicId: topic.id,
                fromDate: topic.scheduledDate,
                toDate: today,
                kind: "auto",
                createdAt: now.toISOString(),
            })
                .run();
            c.db
                .update(topics)
                .set({ scheduledDate: today, updatedAt: now.toISOString() })
                .where(eq(topics.id, topic.id))
                .run();
        }
        return { today, moved: overdue.length };
    })();
}
