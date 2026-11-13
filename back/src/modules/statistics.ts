import { DateTime } from "luxon";
import { and, eq } from "drizzle-orm";
import type { Connection } from "../db/index.js";
import { topics, transfers, topicProgress, calendars } from "../db/schema.js";
import { localDate } from "./calendar.js";
interface LearningTopic {
  id: string;
  scheduledDate: string;
  status: string;
  completedAt: string | null;
}
export function summarize(
  all: LearningTopic[],
  timezone: string,
  start: string,
  now: Date = new Date(),
  days = 7,
  autoIds = new Set<string>(),
) {
  const end = DateTime.fromISO(start).plus({ days }).toISODate()!;
  const inside = (d: string) => d >= start && d < end;
  const completedDate = (t: LearningTopic) =>
    t.completedAt ? localDate(timezone, new Date(t.completedAt)) : "";
  const done = all.filter(
      (t) => t.status === "completed" && inside(completedDate(t)),
    ),
    doneIds = new Set(done.map((t) => t.id));
  const planned = all.filter(
    (t) => inside(t.scheduledDate) || doneIds.has(t.id),
  ).length;
  const completionDays = new Set(
    all.filter((t) => t.status === "completed").map(completedDate),
  );
  let day = DateTime.fromISO(localDate(timezone, now)),
    streak = 0;
  if (!completionDays.has(day.toISODate()!)) day = day.minus({ days: 1 });
  while (completionDays.has(day.toISODate()!)) {
    streak++;
    day = day.minus({ days: 1 });
  }
  const today = localDate(timezone, now);
  return {
    completed: done.length,
    planned,
    pending: all.filter((t) => t.status === "pending").length,
    carriedToday: all.filter(
      (t) =>
        t.scheduledDate === today &&
        t.status === "pending" &&
        autoIds.has(t.id),
    ).length,
    streak,
    percentage: planned ? Math.round((done.length / planned) * 100) : 0,
    totalCompleted: all.filter((t) => t.status === "completed").length,
    activity: Array.from({ length: days }, (_, i) => {
      const date = DateTime.fromISO(start).plus({ days: i }).toISODate()!;
      return {
        date,
        count: done.filter((t) => completedDate(t) === date).length,
      };
    }),
  };
}
export function statistics(
  c: Connection,
  userId: string,
  timezone: string,
  start: string,
  now: Date = new Date(),
) {
  const personal = c.db
    .select()
    .from(topicProgress)
    .where(eq(topicProgress.userId, userId))
    .all();
  const owned = c.db
    .select()
    .from(topics)
    .where(eq(topics.userId, userId))
    .all()
    .map((topic) => {
      const progress = personal.find((p) => p.topicId === topic.id);
      return progress
        ? {
            ...topic,
            scheduledDate:
              progress.scheduledDate || topic.planDate || topic.scheduledDate,
            status: progress.completedAt ? "completed" : "pending",
            completedAt: progress.completedAt,
            personalHistory: progress.history,
          }
        : { ...topic, personalHistory: "[]" };
    });
  const joined = c.db
    .select({ topic: topics, progress: topicProgress })
    .from(topicProgress)
    .innerJoin(topics, eq(topics.id, topicProgress.topicId))
    .innerJoin(calendars, eq(topics.calendarId, calendars.id))
    .where(and(eq(topicProgress.userId, userId), eq(calendars.isPublic, true)))
    .all()
    .filter((r) => r.topic.userId !== userId)
    .map(({ topic, progress }) => ({
      ...topic,
      scheduledDate:
        progress.scheduledDate || topic.planDate || topic.scheduledDate,
      status: progress.completedAt ? "completed" : "pending",
      completedAt: progress.completedAt,
      personalHistory: progress.history,
    }));
  const today = localDate(timezone, now);
  const autoIds = new Set(
    c.db
      .select({ topicId: transfers.topicId })
      .from(transfers)
      .innerJoin(topics, eq(topics.id, transfers.topicId))
      .where(
        and(
          eq(topics.userId, userId),
          eq(transfers.kind, "auto"),
          eq(transfers.toDate, today),
        ),
      )
      .all()
      .map((t) => t.topicId),
  );
  for (const topic of [...owned, ...joined]) {
    const history = JSON.parse(topic.personalHistory) as {
      kind: string;
      toDate: string;
    }[];
    if (history.some((h) => h.kind === "auto" && h.toDate === today))
      autoIds.add(topic.id);
  }
  return summarize([...owned, ...joined], timezone, start, now, 7, autoIds);
}
