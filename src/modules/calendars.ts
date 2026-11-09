import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { Connection } from "../db/index.js";
import {
  calendars,
  topics,
  users,
  resources,
  transfers,
  topicProgress,
  personalNotes,
} from "../db/schema.js";
import { createPlan } from "./plan.js";
import { goBackendCurriculum } from "./go-backend-curriculum.js";
import { localDate, syncCalendar } from "./calendar.js";
import { summarize } from "./statistics.js";
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      DateTime.fromISO(s).isValid && s >= "1900-01-01" && s <= "2200-12-31",
    "Некорректная дата",
  );
export function ensurePublicCalendar(c: Connection, now: Date) {
  return c.sqlite.transaction(() => {
    let calendar = c.db
      .select()
      .from(calendars)
      .where(eq(calendars.isDefault, true))
      .get();
    const timestamp = now.toISOString();
    if (!calendar) {
      const ownerId = "studyflow-editorial";
      c.db
        .insert(users)
        .values({
          id: ownerId,
          email: "editorial@studyflow.invalid",
          passwordHash: "!system-account-disabled",
          name: "StudyFlow",
          timezone: "UTC",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .run();
      calendar = c.db
        .insert(calendars)
        .values({
          id: "studyflow-go-backend",
          ownerId,
          title: "Go & Backend · от основ к практике",
          isPublic: true,
          isDefault: true,
          createdAt: timestamp,
        })
        .returning()
        .get()!;
    }
    if (calendar.curriculumVersion >= 1) return calendar;
    // Explicit one-time replacement of the public starter plan. Personal calendars are untouched.
    // Dependent notes/progress/resources are removed by their foreign-key cascades.
    c.db.delete(topics).where(eq(topics.calendarId, calendar.id)).run();
    for (const lesson of goBackendCurriculum) {
      const id = randomUUID();
      c.db
        .insert(topics)
        .values({
          id,
          userId: calendar.ownerId,
          calendarId: calendar.id,
          title: lesson.title,
          notes: lesson.notes,
          planDate: lesson.date,
          originalDate: lesson.date,
          scheduledDate: lesson.date,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      c.db
        .insert(resources)
        .values(
          lesson.resources.map((resource) => ({
            ...resource,
            id: randomUUID(),
            topicId: id,
          })),
        )
        .run();
    }
    c.db
      .update(calendars)
      .set({ curriculumVersion: 1 })
      .where(eq(calendars.id, calendar.id))
      .run();
    return { ...calendar, curriculumVersion: 1 };
  })();
}
export function calendarRoutes(c: Connection, clock: () => Date) {
  const router = Router();
  const viewer = (req: Request) =>
    req.session.userId
      ? c.db.select().from(users).where(eq(users.id, req.session.userId)).get()
      : undefined;
  function accessible(req: Request) {
    const calendar = c.db
      .select()
      .from(calendars)
      .where(eq(calendars.id, String(req.params.calendarId)))
      .get();
    if (
      !calendar ||
      (!calendar.isPublic && calendar.ownerId !== req.session.userId)
    )
      fail(404, "Календарь не найден");
    return calendar!;
  }
  function requireUser(req: Request) {
    return viewer(req) || fail(401, "Войдите, чтобы сохранить личный прогресс");
  }
  function owner(req: Request) {
    requireUser(req);
    const calendar = accessible(req);
    if (calendar.ownerId !== req.session.userId)
      fail(403, "Изменять учебный план может только его создатель");
    return calendar;
  }
  const metadata = (calendar: typeof calendars.$inferSelect, req: Request) => ({
    ...calendar,
    role: calendar.ownerId === req.session.userId ? "creator" : "reader",
    topicCount: c.db
      .select()
      .from(topics)
      .where(eq(topics.calendarId, calendar.id))
      .all().length,
    creatorName:
      c.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, calendar.ownerId))
        .get()?.name || "Автор",
  });
  function content(req: Request, edit = false) {
    const calendar = accessible(req),
      u = viewer(req),
      isOwner = u?.id === calendar.ownerId;
    if (edit && !isOwner)
      fail(u ? 403 : 401, "Редактирование доступно только создателю календаря");
    if (isOwner && !edit) syncCalendar(c, u!.id, u!.timezone, clock());
    const allTopics = c.db
      .select()
      .from(topics)
      .where(eq(topics.calendarId, calendar.id))
      .all();
    // Personal scheduling is an overlay. A learner's midnight never shifts the shared plan.
    if (u && !edit)
      c.sqlite.transaction(() => {
        const today = localDate(u.timezone, clock());
        for (const topic of allTopics) {
          let progress = c.db
            .select()
            .from(topicProgress)
            .where(
              and(
                eq(topicProgress.userId, u.id),
                eq(topicProgress.topicId, topic.id),
              ),
            )
            .get();
          if (!progress) {
            c.db
              .insert(topicProgress)
              .values({
                userId: u.id,
                topicId: topic.id,
                completedAt: isOwner ? topic.completedAt : null,
                scheduledDate: isOwner
                  ? topic.scheduledDate
                  : topic.planDate || topic.scheduledDate,
              })
              .run();
            progress = c.db
              .select()
              .from(topicProgress)
              .where(
                and(
                  eq(topicProgress.userId, u.id),
                  eq(topicProgress.topicId, topic.id),
                ),
              )
              .get()!;
          }
          const scheduled =
            progress.scheduledDate || topic.planDate || topic.scheduledDate;
          if (!progress.completedAt && scheduled < today) {
            const history = JSON.parse(progress.history) as {
              id: string;
              topicId: string;
              fromDate: string;
              toDate: string;
              kind: string;
              createdAt: string;
            }[];
            history.push({
              id: randomUUID(),
              topicId: topic.id,
              fromDate: scheduled,
              toDate: today,
              kind: "auto",
              createdAt: clock().toISOString(),
            });
            c.db
              .update(topicProgress)
              .set({ scheduledDate: today, history: JSON.stringify(history) })
              .where(
                and(
                  eq(topicProgress.userId, u.id),
                  eq(topicProgress.topicId, topic.id),
                ),
              )
              .run();
          }
        }
      })();
    const progress = u
      ? c.db
          .select()
          .from(topicProgress)
          .where(eq(topicProgress.userId, u.id))
          .all()
      : [];
    const list = c.db
      .select()
      .from(topics)
      .where(eq(topics.calendarId, calendar.id))
      .all()
      .map((t) => {
        const personal = progress.find((p) => p.topicId === t.id);
        const history = [
          ...c.db
            .select()
            .from(transfers)
            .where(eq(transfers.topicId, t.id))
            .all()
            .filter((h) => h.kind === "manual" || (isOwner && !edit)),
          ...(!edit && personal ? JSON.parse(personal.history) : []),
        ].filter(
          (entry, index, array) =>
            array.findIndex(
              (h) =>
                h.fromDate === entry.fromDate &&
                h.toDate === entry.toDate &&
                h.kind === entry.kind,
            ) === index,
        );
        return {
          ...t,
          userId: undefined,
          status: edit
            ? "pending"
            : personal?.completedAt
              ? "completed"
              : "pending",
          completedAt: edit ? null : personal?.completedAt || null,
          scheduledDate:
            edit || !u
              ? t.planDate || t.scheduledDate
              : personal?.scheduledDate || t.planDate || t.scheduledDate,
          resources: c.db
            .select()
            .from(resources)
            .where(eq(resources.topicId, t.id))
            .all(),
          history,
        };
      });
    return { calendar: metadata(calendar, req), u, list };
  }
  router.get("/", (req, res) => {
    ensurePublicCalendar(c, clock());
    const uid = req.session.userId;
    const list = c.db
      .select()
      .from(calendars)
      .where(
        uid
          ? or(eq(calendars.isPublic, true), eq(calendars.ownerId, uid))
          : eq(calendars.isPublic, true),
      )
      .all();
    res.json({
      calendars: list
        .map((x) => metadata(x, req))
        .sort(
          (a, b) =>
            Number(b.isDefault) - Number(a.isDefault) ||
            a.title.localeCompare(b.title),
        ),
    });
  });
  router.post("/", (req, res) => {
    const u = requireUser(req),
      input = z
        .object({
          title: z.string().trim().min(1).max(100),
          isPublic: z.boolean().default(false),
        })
        .parse(req.body);
    const calendar = {
      ...input,
      id: randomUUID(),
      ownerId: u.id,
      isDefault: false,
      curriculumVersion: 0,
      createdAt: clock().toISOString(),
    };
    c.db.insert(calendars).values(calendar).run();
    res.status(201).json(metadata(calendar, req));
  });
  router.patch("/:calendarId", (req, res) => {
    const calendar = owner(req),
      input = z
        .object({
          title: z.string().trim().min(1).max(100).optional(),
          isPublic: z.boolean().optional(),
        })
        .parse(req.body);
    if (!Object.keys(input).length) fail(400, "Укажите изменения");
    c.db
      .update(calendars)
      .set(input)
      .where(eq(calendars.id, calendar.id))
      .run();
    res.json(metadata({ ...calendar, ...input }, req));
  });
  router.get("/:calendarId/range", (req, res) => {
    const start = date.parse(req.query.start),
      end = date.parse(req.query.end),
      days = DateTime.fromISO(end).diff(DateTime.fromISO(start), "days").days;
    if (days < 1 || days > 42)
      fail(400, "Допустимый диапазон — от 1 до 42 дней");
    const periodStart = date.parse(req.query.periodStart || start),
      periodEnd = date.parse(req.query.periodEnd || end);
    if (periodStart < start || periodEnd > end || periodStart >= periodEnd)
      fail(400, "Период статистики должен входить в диапазон календаря");
    const edit = req.query.mode === "edit",
      { calendar, u, list } = content(req, edit),
      tz = u?.timezone || "UTC";
    const allHistory = list
      .flatMap((t) => t.history.map((h) => ({ ...h, title: t.title })))
      .filter((h) => h.fromDate >= start && h.fromDate < end);
    res.json({
      calendar,
      start,
      end,
      today: localDate(tz, clock()),
      topics: list.filter(
        (t) => t.scheduledDate >= start && t.scheduledDate < end,
      ),
      transfers: allHistory,
      stats: summarize(
        list,
        tz,
        periodStart,
        clock(),
        DateTime.fromISO(periodEnd).diff(DateTime.fromISO(periodStart), "days")
          .days,
        new Set(
          list
            .filter((t) =>
              t.history.some(
                (h) => h.kind === "auto" && h.toDate === localDate(tz, clock()),
              ),
            )
            .map((t) => t.id),
        ),
      ),
    });
  });
  router.post("/:calendarId/sync", (req, res) => {
    requireUser(req);
    content(req);
    res.json({ ok: true });
  });
  router.get("/:calendarId/topics/:topicId", (req, res) => {
    const { list } = content(req, req.query.mode === "edit");
    const topic = list.find((t) => t.id === String(req.params.topicId));
    if (!topic) fail(404, "Тема не найдена");
    res.json(topic);
  });
  // Personal notes never enter the shared topic payload; identity comes only from the session.
  for (const method of ["get", "patch"] as const)
    router[method]("/:calendarId/topics/:topicId/personal-note", (req, res) => {
      const u = requireUser(req),
        calendar = accessible(req);
      const topic = c.db
        .select()
        .from(topics)
        .where(
          and(
            eq(topics.id, String(req.params.topicId)),
            eq(topics.calendarId, calendar.id),
          ),
        )
        .get();
      if (!topic) fail(404, "Тема не найдена");
      const identity = and(
        eq(personalNotes.userId, u.id),
        eq(personalNotes.topicId, topic!.id),
      );
      if (method === "patch") {
        const input = z
          .object({ text: z.string().max(100000) })
          .strict()
          .parse(req.body);
        if (!input.text.trim())
          c.db.delete(personalNotes).where(identity).run();
        else
          c.db
            .insert(personalNotes)
            .values({
              userId: u.id,
              topicId: topic!.id,
              text: input.text,
              updatedAt: clock().toISOString(),
            })
            .onConflictDoUpdate({
              target: [personalNotes.userId, personalNotes.topicId],
              set: { text: input.text, updatedAt: clock().toISOString() },
            })
            .run();
      }
      const note = c.db.select().from(personalNotes).where(identity).get();
      res.json({ text: note?.text || "", updatedAt: note?.updatedAt || null });
    });
  for (const action of ["complete", "reopen"] as const)
    router.patch(`/:calendarId/topics/:topicId/${action}`, (req, res) => {
      const u = requireUser(req),
        calendar = accessible(req),
        topic = c.db
          .select()
          .from(topics)
          .where(
            and(
              eq(topics.id, String(req.params.topicId)),
              eq(topics.calendarId, calendar.id),
            ),
          )
          .get();
      if (!topic) fail(404, "Тема не найдена");
      const completedAt = action === "complete" ? clock().toISOString() : null;
      c.sqlite.transaction(() => {
        if (calendar.ownerId === u.id) {
          if (
            (action === "complete" && topic!.status !== "completed") ||
            (action === "reopen" && topic!.status !== "pending")
          )
            c.db
              .update(topics)
              .set({
                status: action === "complete" ? "completed" : "pending",
                completedAt,
                updatedAt: clock().toISOString(),
              })
              .where(eq(topics.id, topic!.id))
              .run();
        }
        const previous = c.db
          .select()
          .from(topicProgress)
          .where(
            and(
              eq(topicProgress.userId, u.id),
              eq(topicProgress.topicId, topic!.id),
            ),
          )
          .get();
        const personalCompletedAt =
          action === "complete" ? previous?.completedAt || completedAt : null;
        c.db
          .insert(topicProgress)
          .values({
            userId: u.id,
            topicId: topic!.id,
            scheduledDate: topic!.planDate || topic!.scheduledDate,
            completedAt: personalCompletedAt,
          })
          .onConflictDoUpdate({
            target: [topicProgress.userId, topicProgress.topicId],
            set: { completedAt: personalCompletedAt },
          })
          .run();
      })();
      res.json({ ok: true });
    });
  router.post("/:calendarId/plan", (req, res) => {
    const calendar = owner(req),
      input = z.object({ start: date }).parse(req.body);
    if (
      c.db.select().from(topics).where(eq(topics.calendarId, calendar.id)).get()
    )
      fail(409, "Готовый план можно добавить только в пустой календарь");
    // Calendar-level creation is atomic and guarded by emptiness, independent of legacy onboarding.
    createPlan(c, req.session.userId!, input.start, calendar.id, true);
    res.status(201).json({ ok: true, count: 28 });
  });
  return router;
}
