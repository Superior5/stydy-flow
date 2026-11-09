import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { connect } from "../src/db/index.js";
import { ensurePublicCalendar } from "../src/modules/calendars.js";
import { goBackendCurriculum } from "../src/modules/go-backend-curriculum.js";
import {
  users,
  calendars,
  topics,
  resources,
  personalNotes,
  topicProgress,
} from "../src/db/schema.js";
const now = new Date("2026-11-09T09:00:00Z");

describe("45-day Go & Backend curriculum", () => {
  it("preserves every supplied weekday, lesson, exercise and resource, including holidays and the final defense", () => {
    const source = readFileSync(
      new URL("../../docs/go-backend-plan.md", import.meta.url),
      "utf8",
    );
    const rows = source
      .split("\n")
      .filter((line) => /^\| \*\*(Пн|Вт|Ср|Чт|Пт),/.test(line));
    expect(goBackendCurriculum).toHaveLength(45);
    expect(rows).toHaveLength(45);
    expect(goBackendCurriculum[0].date).toBe("2026-11-09");
    expect(goBackendCurriculum.at(-1)!.date).toBe("2027-01-08");
    expect(new Set(goBackendCurriculum.map((t) => t.date)).size).toBe(45);
    rows.forEach((row, i) => {
      const [day, subject, practice, links] = row
        .split("|")
        .slice(1, -1)
        .map((s) => s.trim());
      const lesson = goBackendCurriculum[i];
      const date = DateTime.fromISO(lesson.date);
      expect(date.weekday).toBeLessThan(6);
      expect(day).toContain(date.toFormat("dd.MM"));
      expect(lesson.notes).toContain(subject);
      expect(lesson.notes).toContain(practice);
      expect(lesson.resources).toEqual(
        [...links.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => ({
          title: m[1],
          url: m[2],
        })),
      );
    });
    expect(goBackendCurriculum.flatMap((t) => t.resources)).toHaveLength(107);
    expect(goBackendCurriculum.some((t) => t.date === "2027-01-01")).toBe(true);
    expect(goBackendCurriculum.at(-1)!.notes).toContain("восемь сценариев");
    expect(goBackendCurriculum.at(-1)!.notes).toContain("Падение worker");
  });
  it("replaces only the previous default plan and applies the update just once", () => {
    const c = connect(":memory:");
    try {
      c.db
        .insert(users)
        .values({
          id: "u",
          email: "u@test.example",
          passwordHash: "!",
          name: "U",
          timezone: "UTC",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        })
        .run();
      c.db
        .insert(calendars)
        .values([
          {
            id: "default",
            ownerId: "u",
            title: "Go & Backend",
            isDefault: true,
            isPublic: true,
            createdAt: now.toISOString(),
          },
          {
            id: "private",
            ownerId: "u",
            title: "Личный",
            createdAt: now.toISOString(),
          },
        ])
        .run();
      for (const [id, calendarId] of [
        ["old", "default"],
        ["own", "private"],
      ]) {
        c.db
          .insert(topics)
          .values({
            id,
            calendarId,
            userId: "u",
            title: id,
            notes: "старый текст",
            originalDate: "2026-11-01",
            scheduledDate: "2026-11-01",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
          .run();
        c.db
          .insert(personalNotes)
          .values({
            userId: "u",
            topicId: id,
            text: "личная заметка",
            updatedAt: now.toISOString(),
          })
          .run();
        c.db
          .insert(topicProgress)
          .values({ userId: "u", topicId: id, completedAt: now.toISOString() })
          .run();
      }
      const calendar = ensurePublicCalendar(c, now);
      expect(calendar.id).toBe("default");
      expect(calendar.curriculumVersion).toBe(1);
      const seeded = c.db
        .select()
        .from(topics)
        .where(eq(topics.calendarId, calendar.id))
        .all();
      expect(seeded).toHaveLength(45);
      expect(c.db.select().from(resources).all()).toHaveLength(107);
      expect(c.db.select().from(personalNotes).all()).toMatchObject([
        { topicId: "own", text: "личная заметка" },
      ]);
      expect(c.db.select().from(topicProgress).all()).toMatchObject([
        { topicId: "own" },
      ]);
      expect(
        c.db.select().from(topics).where(eq(topics.id, "own")).get()?.notes,
      ).toBe("старый текст");
      c.db
        .insert(personalNotes)
        .values({
          userId: "u",
          topicId: seeded[0].id,
          text: "новая заметка",
          updatedAt: now.toISOString(),
        })
        .run();
      ensurePublicCalendar(c, new Date("2027-02-01T00:00:00Z"));
      expect(
        c.db
          .select()
          .from(topics)
          .where(eq(topics.calendarId, calendar.id))
          .all(),
      ).toEqual(seeded);
      expect(c.db.select().from(personalNotes).all()).toHaveLength(2);
    } finally {
      c.sqlite.close();
    }
  });
  it("rolls back deletion, new topics and revision together if replacement fails", () => {
    const c = connect(":memory:");
    try {
      const calendar = ensurePublicCalendar(c, now);
      c.db
        .update(calendars)
        .set({ curriculumVersion: 0 })
        .where(eq(calendars.id, calendar.id))
        .run();
      const before = c.db.select().from(topics).all();
      c.sqlite.exec(
        "CREATE TRIGGER stop_curriculum BEFORE INSERT ON topics BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
      );
      expect(() => ensurePublicCalendar(c, now)).toThrow("test failure");
      expect(c.db.select().from(topics).all()).toEqual(before);
      expect(c.db.select().from(resources).all()).toHaveLength(107);
      expect(c.db.select().from(calendars).get()?.curriculumVersion).toBe(0);
    } finally {
      c.sqlite.close();
    }
  });
});
