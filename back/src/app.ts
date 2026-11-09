import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import session from "express-session";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcrypt";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { and, eq, gte, lt } from "drizzle-orm";
import { DateTime, IANAZone } from "luxon";
import { z } from "zod";
import type { Connection } from "./db/index.js";
import { users, topics, resources, transfers } from "./db/schema.js";
import { syncCalendar, localDate } from "./modules/calendar.js";
import { statistics } from "./modules/statistics.js";
import { SQLiteSessionStore } from "./modules/session-store.js";
import { calendarRoutes } from "./modules/calendars.js";
import { personalCalendar } from "./modules/calendar-access.js";
import { calendars, topicProgress } from "./db/schema.js";
import { createPlan } from "./modules/plan.js";
import { settings, production } from "./config.js";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      DateTime.fromISO(s).isValid && s >= "1900-01-01" && s <= "2200-12-31",
    "Некорректная дата",
  );
const timezone = z
  .string()
  .refine((s) => IANAZone.isValidZone(s), "Укажите IANA timezone");
const resource = z.object({
  title: z.string().trim().min(1).max(200),
  url: z
    .url()
    .max(2048)
    .refine(
      (s) => ["http:", "https:"].includes(new URL(s).protocol),
      "Только HTTP/HTTPS",
    ),
});
const topicInput = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(100000).default(""),
  scheduledDate: date,
  calendarId: z.string().max(100).optional(),
  resources: z.array(resource).max(30).optional(),
});
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z
    .string()
    .min(8)
    .refine(
      (s) => Buffer.byteLength(s, "utf8") <= 72,
      "Пароль: максимум 72 байта",
    ),
});
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const safeUser = (u: typeof users.$inferSelect) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  timezone: u.timezone,
  planHandled: u.planHandled,
});
export function createApp(
  c: Connection,
  options: { now?: () => Date; origin?: string; secret?: string } = {},
) {
  const app = express(),
    clock = options.now || (() => new Date()),
    origin = options.origin || settings.origin;
  const store = new SQLiteSessionStore(c.sqlite);
  app.locals.sessionStore = store;
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "256kb" }));
  app.use(
    session({
      name: "studyflow.sid",
      secret: options.secret || settings.secret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        maxAge: 30 * 86400000,
      },
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const source = req.get("origin");
    const allowed = new Set([
      origin,
      ...(!production
        ? ["http://localhost:5173", "http://127.0.0.1:5173"]
        : []),
    ]);
    if (!source || !allowed.has(source))
      return res.status(403).json({
        error: { message: "Недопустимый источник запроса", code: 403 },
      });
    const token = req.get("x-csrf-token") || "",
      expected = req.session.csrfToken || "";
    if (
      !/^[a-f0-9]{48}$/.test(token) ||
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      return res.status(403).json({
        error: { message: "Обновите страницу и повторите запрос", code: 403 },
      });
    next();
  });
  app.get("/api/auth/csrf", (req, res) => {
    req.session.csrfToken ||= randomBytes(24).toString("hex");
    res.json({ csrfToken: req.session.csrfToken });
  });
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          message: "Слишком много попыток. Попробуйте позже.",
          code: 429,
        },
      }),
  });
  async function establish(req: Request, userId: string) {
    await new Promise<void>((ok, bad) =>
      req.session.regenerate((e) => (e ? bad(e) : ok())),
    );
    req.session.userId = userId;
    req.session.csrfToken = randomBytes(24).toString("hex");
    await new Promise<void>((ok, bad) =>
      req.session.save((e) => (e ? bad(e) : ok())),
    );
  }
  app.post("/api/auth/register", limiter, async (req, res) => {
    const input = credentials
      .extend({
        name: z.string().trim().max(80).optional(),
        timezone: timezone.default("UTC"),
      })
      .parse(req.body);
    if (c.db.select().from(users).where(eq(users.email, input.email)).get())
      fail(400, "Не удалось создать аккаунт. Проверьте данные или войдите.");
    const passwordHash = await bcrypt.hash(input.password, 12),
      now = clock().toISOString(),
      id = randomUUID();
    try {
      c.db
        .insert(users)
        .values({
          id,
          email: input.email,
          passwordHash,
          name: input.name || input.email.split("@")[0],
          timezone: input.timezone,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch {
      fail(400, "Не удалось создать аккаунт. Проверьте данные или войдите.");
    }
    await establish(req, id);
    res.status(201).json({
      user: safeUser(c.db.select().from(users).where(eq(users.id, id)).get()!),
      csrfToken: req.session.csrfToken,
    });
  });
  const dummy = bcrypt.hashSync("constant-invalid-password", 12);
  app.post("/api/auth/login", limiter, async (req, res) => {
    const input = credentials.parse(req.body),
      u = c.db.select().from(users).where(eq(users.email, input.email)).get();
    const valid = await bcrypt.compare(
      input.password,
      u?.passwordHash || dummy,
    );
    if (!u || !valid) fail(401, "Неверный email или пароль");
    await establish(req, u!.id);
    res.json({ user: safeUser(u!), csrfToken: req.session.csrfToken });
  });
  app.use("/api/calendars", calendarRoutes(c, clock));
  app.use("/api", (req, _res, next) => {
    if (!req.session.userId)
      return next(
        Object.assign(new Error("Войдите в аккаунт"), { status: 401 }),
      );
    next();
  });
  const user = (req: Request) =>
    c.db.select().from(users).where(eq(users.id, req.session.userId!)).get()!;
  const owned = (req: Request) => {
    const t = c.db
      .select()
      .from(topics)
      .where(
        and(
          eq(topics.id, String(req.params.id)),
          eq(topics.userId, req.session.userId!),
        ),
      )
      .get();
    return t || fail(404, "Тема не найдена");
  };
  const hydrate = (t: typeof topics.$inferSelect) => ({
    ...t,
    resources: c.db
      .select()
      .from(resources)
      .where(eq(resources.topicId, t.id))
      .all(),
    history: c.db
      .select()
      .from(transfers)
      .where(eq(transfers.topicId, t.id))
      .all()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  });
  app.get("/api/auth/me", (req, res) =>
    res.json({ user: safeUser(user(req)) }),
  );
  app.post("/api/auth/logout", (req, res, next) =>
    req.session.destroy((e) => {
      if (e) return next(e);
      res.clearCookie("studyflow.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
      });
      res.json({ ok: true });
    }),
  );
  app.patch("/api/users/me", (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        timezone: timezone.optional(),
        planHandled: z.literal(true).optional(),
      })
      .parse(req.body);
    c.db
      .update(users)
      .set({ ...input, updatedAt: clock().toISOString() })
      .where(eq(users.id, req.session.userId!))
      .run();
    const u = user(req);
    syncCalendar(c, u.id, u.timezone, clock());
    res.json({ user: safeUser(u) });
  });
  app.post("/api/calendar/sync", (req, res) => {
    const u = user(req);
    res.json(syncCalendar(c, u.id, u.timezone, clock()));
  });
  const weekStart = (req: Request) =>
    date.parse(
      req.query.start ||
        DateTime.fromISO(localDate(user(req).timezone, clock()))
          .startOf("week")
          .toISODate(),
    );
  app.get("/api/calendar/week", (req, res) => {
    const u = user(req);
    syncCalendar(c, u.id, u.timezone, clock());
    const start = weekStart(req),
      end = DateTime.fromISO(start).plus({ days: 7 }).toISODate()!;
    const list = c.db
      .select()
      .from(topics)
      .where(
        and(
          eq(topics.userId, u.id),
          gte(topics.scheduledDate, start),
          lt(topics.scheduledDate, end),
        ),
      )
      .all();
    const history = c.db
      .select({ transfer: transfers, topic: topics })
      .from(transfers)
      .innerJoin(topics, eq(topics.id, transfers.topicId))
      .where(
        and(
          eq(topics.userId, u.id),
          gte(transfers.fromDate, start),
          lt(transfers.fromDate, end),
        ),
      )
      .all()
      .map((r) => ({ ...r.transfer, title: r.topic.title }));
    res.json({
      start,
      today: localDate(u.timezone, clock()),
      topics: list.map(hydrate),
      transfers: history,
      stats: statistics(c, u.id, u.timezone, start, clock()),
    });
  });
  app.get("/api/stats/overview", (req, res) => {
    const u = user(req);
    syncCalendar(c, u.id, u.timezone, clock());
    res.json(
      statistics(
        c,
        u.id,
        u.timezone,
        DateTime.fromISO(localDate(u.timezone, clock()))
          .startOf("week")
          .toISODate()!,
        clock(),
      ),
    );
  });
  app.get("/api/stats/weekly", (req, res) => {
    const u = user(req);
    res.json(statistics(c, u.id, u.timezone, weekStart(req), clock()));
  });
  function replaceResources(topicId: string, list: z.infer<typeof resource>[]) {
    c.db.delete(resources).where(eq(resources.topicId, topicId)).run();
    for (const r of list)
      c.db
        .insert(resources)
        .values({ ...r, id: randomUUID(), topicId })
        .run();
  }
  app.post("/api/topics", (req, res) => {
    const input = topicInput.parse(req.body),
      id = randomUUID(),
      now = clock().toISOString();
    const calendar = input.calendarId
      ? c.db
          .select()
          .from(calendars)
          .where(eq(calendars.id, input.calendarId))
          .get()
      : personalCalendar(c, req.session.userId!);
    if (!calendar || calendar.ownerId !== req.session.userId)
      fail(403, "Добавлять темы может только создатель календаря");
    c.sqlite.transaction(() => {
      const { resources: list, ...data } = input;
      c.db
        .insert(topics)
        .values({
          ...data,
          id,
          userId: req.session.userId!,
          calendarId: calendar!.id,
          planDate: data.scheduledDate,
          originalDate: data.scheduledDate,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (list) replaceResources(id, list);
    })();
    res
      .status(201)
      .json(
        hydrate(c.db.select().from(topics).where(eq(topics.id, id)).get()!),
      );
  });
  app.get("/api/topics/:id", (req, res) => res.json(hydrate(owned(req))));
  app.patch("/api/topics/:id", (req, res) => {
    const t = owned(req),
      input = topicInput
        .omit({ notes: true, calendarId: true })
        .extend({ notes: z.string().max(100000) })
        .partial()
        .parse(req.body);
    c.sqlite.transaction(() => {
      const { resources: list, ...data } = input;
      const now = clock().toISOString();
      if (data.scheduledDate && data.scheduledDate !== t.scheduledDate)
        c.db
          .insert(transfers)
          .values({
            id: randomUUID(),
            topicId: t.id,
            fromDate: t.scheduledDate,
            toDate: data.scheduledDate,
            kind: "manual",
            createdAt: now,
          })
          .run();
      c.db
        .update(topics)
        .set({
          ...data,
          ...(data.scheduledDate ? { planDate: data.scheduledDate } : {}),
          updatedAt: now,
        })
        .where(eq(topics.id, t.id))
        .run();
      if (data.scheduledDate)
        c.db
          .update(topicProgress)
          .set({ scheduledDate: data.scheduledDate })
          .where(eq(topicProgress.topicId, t.id))
          .run();
      if (list) replaceResources(t.id, list);
    })();
    res.json(hydrate(owned(req)));
  });
  app.delete("/api/topics/:id", (req, res) => {
    const t = owned(req);
    c.db.delete(topics).where(eq(topics.id, t.id)).run();
    res.json({ ok: true });
  });
  for (const action of ["complete", "reopen"] as const)
    app.patch(`/api/topics/:id/${action}`, (req, res) => {
      const t = owned(req),
        now = clock().toISOString();
      if (
        (action === "complete" && t.status !== "completed") ||
        (action === "reopen" && t.status !== "pending")
      )
        c.db
          .update(topics)
          .set({
            status: action === "complete" ? "completed" : "pending",
            completedAt: action === "complete" ? now : null,
            updatedAt: now,
          })
          .where(eq(topics.id, t.id))
          .run();
      const updated = owned(req);
      c.db
        .insert(topicProgress)
        .values({
          userId: req.session.userId!,
          topicId: t.id,
          scheduledDate: updated.scheduledDate,
          completedAt: updated.completedAt,
        })
        .onConflictDoUpdate({
          target: [topicProgress.userId, topicProgress.topicId],
          set: { completedAt: updated.completedAt },
        })
        .run();
      res.json(hydrate(updated));
    });
  app.post("/api/topics/:id/resources", (req, res) => {
    const t = owned(req),
      input = resource.parse(req.body);
    if (
      c.db.select().from(resources).where(eq(resources.topicId, t.id)).all()
        .length >= 30
    )
      fail(400, "Максимум 30 источников");
    const r = { ...input, id: randomUUID(), topicId: t.id };
    c.db.insert(resources).values(r).run();
    res.status(201).json(r);
  });
  for (const method of ["patch", "delete"] as const)
    app[method]("/api/topics/:id/resources/:resourceId", (req, res) => {
      const t = owned(req),
        where = and(
          eq(resources.id, String(req.params.resourceId)),
          eq(resources.topicId, t.id),
        );
      if (!c.db.select().from(resources).where(where).get())
        fail(404, "Источник не найден");
      if (method === "delete") {
        c.db.delete(resources).where(where).run();
        res.json({ ok: true });
      } else {
        const input = resource
          .partial()
          .refine(
            (value) => Object.keys(value).length > 0,
            "Укажите название или URL",
          )
          .parse(req.body);
        c.db.update(resources).set(input).where(where).run();
        res.json(c.db.select().from(resources).where(where).get());
      }
    });
  app.post("/api/plan", (req, res) => {
    const input = z.object({ start: date }).parse(req.body);
    if (!createPlan(c, req.session.userId!, input.start))
      fail(409, "Предложение учебного плана уже обработано");
    res.status(201).json({ ok: true, count: 28 });
  });
  app.use("/api", (_req, _res, next) =>
    next(Object.assign(new Error("Маршрут не найден"), { status: 404 })),
  );
  if (production) {
    const front = resolve("..", "front", "dist");
    app.use(express.static(front));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(front, "index.html")),
    );
  }
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: {
          message: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
          code: 400,
        },
      });
    const e = err as Error & { status?: number };
    const status = e.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: {
        message:
          status >= 500 ? "Ошибка сервера. Попробуйте ещё раз." : e.message,
        code: status,
      },
    });
  });
  return app;
}
