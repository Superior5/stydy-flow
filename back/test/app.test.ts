import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, type Connection } from "../src/db/index.js";
import { createApp } from "../src/app.js";
import { syncCalendar, localDate } from "../src/modules/calendar.js";
import { statistics } from "../src/modules/statistics.js";
import {
  users,
  topics,
  transfers,
  resources,
  personalNotes,
  topicProgress,
} from "../src/db/schema.js";
const origin = "http://localhost:5173";
let c: Connection, app: ReturnType<typeof createApp>, now: Date;
beforeEach(() => {
  now = new Date("2026-11-09T09:00:00Z");
  c = connect(":memory:");
  app = createApp(c, {
    origin,
    now: () => now,
    secret: "test-session-secret-at-least-32-chars",
  });
});
afterEach(() => {
  app.locals.sessionStore.close();
  c.sqlite.close();
});
function fixture(id = "u", zone = "Europe/Moscow") {
  c.db
    .insert(users)
    .values({
      id,
      email: `${id}@example.com`,
      passwordHash: "not-used",
      name: id,
      timezone: zone,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .run();
}
function topic(id = "t", date = "2026-11-09", userId = "u", completed = false) {
  c.db
    .insert(topics)
    .values({
      id,
      userId,
      title: "Goroutines",
      notes: "**Мой конспект**",
      originalDate: date,
      scheduledDate: date,
      status: completed ? "completed" : "pending",
      completedAt: completed ? now.toISOString() : null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .run();
}
async function account(email = "alice@example.com") {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken;
  const r = await agent
    .post("/api/auth/register")
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send({
      email,
      password: "correct-horse",
      name: "Алиса",
      timezone: "Europe/Moscow",
    });
  expect(r.status).toBe(201);
  return { agent, csrf: r.body.csrfToken, user: r.body.user };
}
function mutate(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  path: string,
  method: "post" | "patch" | "delete" = "post",
) {
  return agent[method](path).set("Origin", origin).set("X-CSRF-Token", csrf);
}
describe("Atomic calendar synchronization", () => {
  it("moves pending topics on the next day without altering original date, notes or resources", () => {
    fixture();
    topic();
    c.db
      .insert(resources)
      .values({
        id: "r",
        topicId: "t",
        title: "Go",
        url: "https://go.dev/tour/",
      })
      .run();
    now = new Date("2026-11-09T21:00:00Z");
    expect(syncCalendar(c, "u", "Europe/Moscow", now)).toEqual({
      today: "2026-11-10",
      moved: 1,
    });
    const t = c.db.select().from(topics).get()!;
    expect(t.scheduledDate).toBe("2026-11-10");
    expect(t.originalDate).toBe("2026-11-09");
    expect(t.notes).toBe("**Мой конспект**");
    expect(c.db.select().from(resources).all()).toHaveLength(1);
    expect(c.db.select().from(transfers).all()).toHaveLength(1);
  });
  it("never moves a completed topic", () => {
    fixture();
    topic("done", "2026-11-01", "u", true);
    expect(syncCalendar(c, "u", "Europe/Moscow", now).moved).toBe(0);
    expect(c.db.select().from(topics).get()!.scheduledDate).toBe("2026-11-01");
  });
  it("jumps to today after an absence and is idempotent", () => {
    fixture();
    topic("t", "2026-11-01");
    expect(syncCalendar(c, "u", "Europe/Moscow", now).moved).toBe(1);
    expect(syncCalendar(c, "u", "Europe/Moscow", now).moved).toBe(0);
    expect(c.db.select().from(topics).all()).toHaveLength(1);
    expect(c.db.select().from(transfers).all()).toMatchObject([
      { fromDate: "2026-11-01", toDate: "2026-11-09", kind: "auto" },
    ]);
    now = new Date("2026-11-10T08:00:00Z");
    expect(syncCalendar(c, "u", "Europe/Moscow", now).moved).toBe(1);
    expect(c.db.select().from(transfers).all()).toHaveLength(2);
  });
  it("handles timezone changes and exact local midnight", () => {
    fixture();
    topic();
    expect(
      syncCalendar(
        c,
        "u",
        "Europe/Moscow",
        new Date("2026-11-09T20:59:59.999Z"),
      ).moved,
    ).toBe(0);
    expect(
      syncCalendar(
        c,
        "u",
        "Europe/Moscow",
        new Date("2026-11-09T21:00:00.000Z"),
      ).moved,
    ).toBe(1);
    expect(
      syncCalendar(
        c,
        "u",
        "America/Los_Angeles",
        new Date("2026-11-09T21:00:00Z"),
      ).moved,
    ).toBe(0);
    expect(
      localDate("Pacific/Kiritimati", new Date("2026-11-09T10:00:00Z")),
    ).toBe("2026-11-10");
  });
  it("handles a DST short day by calendar date rather than adding 24 hours", () => {
    fixture("u", "America/New_York");
    topic("t", "2026-03-08");
    expect(
      syncCalendar(c, "u", "America/New_York", new Date("2026-03-09T03:59:59Z"))
        .moved,
    ).toBe(0);
    expect(
      syncCalendar(c, "u", "America/New_York", new Date("2026-03-09T04:00:00Z"))
        .moved,
    ).toBe(1);
  });
  it("only processes the requested user", () => {
    fixture();
    fixture("other");
    topic("a", "2026-11-01");
    topic("b", "2026-11-01", "other");
    syncCalendar(c, "u", "Europe/Moscow", now);
    expect(
      c.db.select().from(topics).where(eq(topics.id, "b")).get()!.scheduledDate,
    ).toBe("2026-11-01");
  });
  it("rolls back changes and history together on failure", () => {
    fixture();
    topic("a", "2026-11-01");
    topic("b", "2026-11-02");
    c.sqlite.exec(
      "CREATE TRIGGER fail_sync BEFORE UPDATE ON topics WHEN OLD.id='b' BEGIN SELECT RAISE(ABORT,'test failure'); END",
    );
    expect(() => syncCalendar(c, "u", "Europe/Moscow", now)).toThrow();
    expect(c.db.select().from(transfers).all()).toHaveLength(0);
    expect(
      c.db.select().from(topics).where(eq(topics.id, "a")).get()!.scheduledDate,
    ).toBe("2026-11-01");
  });
});
describe("Statistics", () => {
  it("uses actual completion dates, unique denominator, local dates and consecutive streak", () => {
    fixture();
    topic("a", "2026-11-01", "u", true);
    topic("b", "2026-11-09");
    topic("c", "2026-11-08", "u", true);
    c.db
      .update(topics)
      .set({ completedAt: "2026-11-08T20:00:00Z" })
      .where(eq(topics.id, "c"))
      .run();
    syncCalendar(c, "u", "Europe/Moscow", now);
    const stats = statistics(c, "u", "Europe/Moscow", "2026-11-09", now);
    expect(stats.completed).toBe(1);
    expect(stats.planned).toBe(2);
    expect(stats.percentage).toBe(50);
    expect(stats.streak).toBe(2);
    expect(stats.totalCompleted).toBe(2);
    expect(stats.activity[0].count).toBe(1);
    expect(stats.pending).toBe(1);
  });
  it("returns a valid empty state and ends an old streak", () => {
    fixture();
    expect(statistics(c, "u", "UTC", "2026-11-09", now)).toMatchObject({
      percentage: 0,
      streak: 0,
      completed: 0,
      planned: 0,
    });
    topic("old", "2026-11-01", "u", true);
    c.db.update(topics).set({ completedAt: "2026-11-06T12:00:00Z" }).run();
    expect(statistics(c, "u", "UTC", "2026-11-09", now).streak).toBe(0);
  });
});
describe("Authenticated API", () => {
  it("registers, creates and fetches a topic, completes it, and shows it in the calendar", async () => {
    const { agent, csrf, user } = await account();
    const created = await mutate(agent, csrf, "/api/topics").send({
      title: "Go: интерфейсы",
      scheduledDate: "2026-11-09",
      notes: "Конспект",
      resources: [{ title: "Tour", url: "https://go.dev/tour/methods/9" }],
    });
    expect(created.status).toBe(201);
    expect(created.body.resources).toHaveLength(1);
    const id = created.body.id;
    expect((await agent.get(`/api/topics/${id}`)).body.title).toBe(
      "Go: интерфейсы",
    );
    expect(
      (await mutate(agent, csrf, `/api/topics/${id}/complete`, "patch")).body
        .status,
    ).toBe("completed");
    const first = (await agent.get(`/api/topics/${id}`)).body.completedAt;
    now = new Date("2026-11-10T09:00:00Z");
    await mutate(agent, csrf, `/api/topics/${id}/complete`, "patch");
    expect((await agent.get(`/api/topics/${id}`)).body.completedAt).toBe(first);
    await mutate(agent, csrf, "/api/calendar/sync");
    const week = await agent.get("/api/calendar/week?start=2026-11-09");
    expect(week.body.topics).toHaveLength(1);
    expect(week.body.topics[0].scheduledDate).toBe("2026-11-09");
    expect(week.body.stats.completed).toBe(1);
    expect((await agent.get("/api/auth/me")).body.user.id).toBe(user.id);
    expect(
      (await agent.get("/api/auth/me")).body.user.passwordHash,
    ).toBeUndefined();
    const hash = c.db.select().from(users).get()!.passwordHash;
    expect(hash.startsWith("$2")).toBe(true);
  });
  it("blocks access to another user’s topics and resources on every operation", async () => {
    const a = await account(),
      b = await account("bob@example.com");
    const t = (
      await mutate(a.agent, a.csrf, "/api/topics").send({
        title: "Private",
        scheduledDate: "2026-11-09",
        resources: [{ title: "Go", url: "https://go.dev/" }],
      })
    ).body;
    for (const [method, suffix] of [
      ["get", ""],
      ["patch", ""],
      ["delete", ""],
      ["patch", "/complete"],
      ["patch", "/reopen"],
      ["post", "/resources"],
      ["patch", `/resources/${t.resources[0].id}`],
      ["delete", `/resources/${t.resources[0].id}`],
    ] as const) {
      const r =
        method === "get"
          ? await b.agent.get(`/api/topics/${t.id}${suffix}`)
          : await mutate(
              b.agent,
              b.csrf,
              `/api/topics/${t.id}${suffix}`,
              method,
            ).send({ title: "Steal", url: "https://go.dev/" });
      expect(r.status).toBe(404);
    }
    expect(
      (await b.agent.get("/api/calendar/week?start=2026-11-09")).body.topics,
    ).toHaveLength(0);
  });
  it("requires origin and CSRF token, validates dates and rejects unsafe URLs", async () => {
    const a = await account();
    expect((await a.agent.post("/api/topics").send({})).status).toBe(403);
    expect(
      (
        await a.agent
          .post("/api/topics")
          .set("Origin", "https://evil.example")
          .set("X-CSRF-Token", a.csrf)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await a.agent
          .post("/api/topics")
          .set("Origin", origin)
          .set("X-CSRF-Token", "bad")
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await mutate(a.agent, a.csrf, "/api/topics").send({
          title: "x",
          scheduledDate: "2026-02-30",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mutate(a.agent, a.csrf, "/api/topics").send({
          title: "x",
          scheduledDate: "2026-11-09",
          resources: [{ title: "XSS", url: "javascript:alert(1)" }],
        })
      ).status,
    ).toBe(400);
  });
  it("edits notes, manually reschedules, updates resources, reopens and deletes", async () => {
    const a = await account();
    const t = (
      await mutate(a.agent, a.csrf, "/api/topics").send({
        title: "x",
        scheduledDate: "2026-11-09",
      })
    ).body;
    const edited = await mutate(
      a.agent,
      a.csrf,
      `/api/topics/${t.id}`,
      "patch",
    ).send({
      title: "Новое название",
      notes: "Заметки",
      scheduledDate: "2026-11-12",
    });
    expect(edited.body.history[0].kind).toBe("manual");
    expect(edited.body.originalDate).toBe("2026-11-09");
    const partial = await mutate(
      a.agent,
      a.csrf,
      `/api/topics/${t.id}`,
      "patch",
    ).send({ scheduledDate: "2026-11-13" });
    expect(partial.status).toBe(200);
    expect(partial.body.notes).toBe("Заметки");
    expect(partial.body.title).toBe("Новое название");
    const r = await mutate(
      a.agent,
      a.csrf,
      `/api/topics/${t.id}/resources`,
    ).send({ title: "Go", url: "https://go.dev/" });
    expect(r.status).toBe(201);
    expect(
      (
        await mutate(
          a.agent,
          a.csrf,
          `/api/topics/${t.id}/resources/${r.body.id}`,
          "patch",
        ).send({ title: "Docs" })
      ).body.title,
    ).toBe("Docs");
    await mutate(a.agent, a.csrf, `/api/topics/${t.id}/complete`, "patch");
    expect(
      (await mutate(a.agent, a.csrf, `/api/topics/${t.id}/reopen`, "patch"))
        .body.completedAt,
    ).toBeNull();
    await mutate(a.agent, a.csrf, `/api/topics/${t.id}`, "delete");
    expect((await a.agent.get(`/api/topics/${t.id}`)).status).toBe(404);
    expect(c.db.select().from(resources).all()).toHaveLength(0);
    expect(c.db.select().from(transfers).all()).toHaveLength(0);
  });
  it("creates the optional plan once, and supports skipping it", async () => {
    const a = await account();
    expect(
      (await mutate(a.agent, a.csrf, "/api/plan").send({ start: "2026-11-09" }))
        .status,
    ).toBe(201);
    expect(c.db.select().from(topics).all()).toHaveLength(28);
    expect(c.db.select().from(resources).all()).toHaveLength(28);
    expect(
      (await mutate(a.agent, a.csrf, "/api/plan").send({ start: "2026-11-09" }))
        .status,
    ).toBe(409);
    const b = await account("bob@example.com");
    await mutate(b.agent, b.csrf, "/api/users/me", "patch").send({
      planHandled: true,
    });
    expect(
      (await mutate(b.agent, b.csrf, "/api/plan").send({ start: "2026-11-09" }))
        .status,
    ).toBe(409);
  });
  it("shows transfer history in the previous week without duplicate tasks", async () => {
    const a = await account();
    await mutate(a.agent, a.csrf, "/api/topics").send({
      title: "Backlog",
      scheduledDate: "2026-11-02",
    });
    const past = await a.agent.get("/api/calendar/week?start=2026-11-02");
    expect(past.body.topics).toHaveLength(0);
    expect(past.body.transfers).toHaveLength(1);
    const current = await a.agent.get("/api/calendar/week?start=2026-11-09");
    expect(current.body.topics).toHaveLength(1);
    expect(current.body.topics[0].history).toHaveLength(1);
  });
  it("persists sessions, logs out, logs in again, and rejects wrong passwords", async () => {
    const a = await account();
    await mutate(a.agent, a.csrf, "/api/auth/logout");
    expect((await a.agent.get("/api/auth/me")).status).toBe(401);
    const csrf = (await a.agent.get("/api/auth/csrf")).body.csrfToken;
    expect(
      (
        await mutate(a.agent, csrf, "/api/auth/login").send({
          email: "alice@example.com",
          password: "wrong-pass",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await mutate(a.agent, csrf, "/api/auth/login").send({
          email: "alice@example.com",
          password: "correct-horse",
        })
      ).status,
    ).toBe(200);
    expect(
      c.sqlite.prepare("SELECT COUNT(*) as n FROM sessions").get(),
    ).toMatchObject({ n: 1 });
  });
  it("updates the timezone and syncs immediately", async () => {
    const a = await account();
    await mutate(a.agent, a.csrf, "/api/topics").send({
      title: "x",
      scheduledDate: "2026-11-09",
    });
    now = new Date("2026-11-09T10:00:00Z");
    const r = await mutate(a.agent, a.csrf, "/api/users/me", "patch").send({
      timezone: "Pacific/Kiritimati",
    });
    expect(r.body.user.timezone).toBe("Pacific/Kiritimati");
    expect(c.db.select().from(topics).get()!.scheduledDate).toBe("2026-11-10");
  });
});
it("persists topics and migrations after reopening the SQLite file", () => {
  const dir = mkdtempSync(join(tmpdir(), "studyflow-test-"));
  try {
    const path = join(dir, "db.sqlite");
    let f = connect(path);
    f.sqlite
      .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)")
      .run(
        "u",
        "u@x.com",
        "hash",
        "name",
        "UTC",
        0,
        now.toISOString(),
        now.toISOString(),
      );
    f.sqlite
      .prepare(
        "INSERT INTO topics(id,user_id,title,notes,status,original_date,scheduled_date,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "t",
        "u",
        "Saved",
        "Notes",
        "pending",
        "2026-11-09",
        "2026-11-09",
        null,
        now.toISOString(),
        now.toISOString(),
      );
    f.db
      .insert(personalNotes)
      .values({
        userId: "u",
        topicId: "t",
        text: "Сохранённая заметка",
        updatedAt: now.toISOString(),
      })
      .run();
    f.sqlite.close();
    f = connect(path);
    expect(f.db.select().from(topics).get()!.title).toBe("Saved");
    expect(f.sqlite.prepare("SELECT * FROM migrations").all()).toHaveLength(5);
    expect(f.db.select().from(personalNotes).get()?.text).toBe(
      "Сохранённая заметка",
    );
    f.sqlite.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps authentication and saved topics after a complete backend restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "studyflow-session-"));
  let connection = connect(join(dir, "db.sqlite"));
  let persistent = createApp(connection, {
    origin,
    secret: "restart-test-session-secret-at-least-32",
    now: () => now,
  });
  try {
    const anonymous = await request(persistent).get("/api/auth/csrf");
    const registered = await request(persistent)
      .post("/api/auth/register")
      .set("Cookie", anonymous.headers["set-cookie"])
      .set("Origin", origin)
      .set("X-CSRF-Token", anonymous.body.csrfToken)
      .send({
        email: "restart@example.test",
        password: "correct-horse",
        timezone: "UTC",
      });
    expect(registered.status).toBe(201);
    const cookie = registered.headers["set-cookie"];
    await request(persistent)
      .post("/api/topics")
      .set("Cookie", cookie)
      .set("Origin", origin)
      .set("X-CSRF-Token", registered.body.csrfToken)
      .send({ title: "Saved across restarts", scheduledDate: "2026-11-09" })
      .expect(201);
    persistent.locals.sessionStore.close();
    connection.sqlite.close();
    connection = connect(join(dir, "db.sqlite"));
    persistent = createApp(connection, {
      origin,
      secret: "restart-test-session-secret-at-least-32",
      now: () => now,
    });
    const me = await request(persistent)
      .get("/api/auth/me")
      .set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("restart@example.test");
    const week = await request(persistent)
      .get("/api/calendar/week?start=2026-11-09")
      .set("Cookie", cookie);
    expect(week.body.topics[0].title).toBe("Saved across restarts");
  } finally {
    persistent.locals.sessionStore.close();
    if (connection.sqlite.open) connection.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Public calendars and creator permissions", () => {
  const range = "?start=2026-11-01&end=2026-12-01";
  async function shared() {
    const owner = await account("creator@example.test");
    const cal = await mutate(owner.agent, owner.csrf, "/api/calendars").send({
      title: "Общий план",
      isPublic: true,
    });
    expect(cal.status).toBe(201);
    const topic = await mutate(owner.agent, owner.csrf, "/api/topics").send({
      title: "Общая тема",
      notes: "Описание для всех",
      scheduledDate: "2026-11-12",
      calendarId: cal.body.id,
      resources: [{ title: "Go", url: "https://go.dev/doc/" }],
    });
    expect(topic.status).toBe(201);
    return { owner, calendar: cal.body, topic: topic.body };
  }
  it("moves only the learner's date, keeps notes, and preserves the creator's shared plan", async () => {
    const { owner, calendar, topic } = await shared();
    const a = await account("schedule-a@example.test"),
      b = await account("schedule-b@example.test");
    const path = `/api/calendars/${calendar.id}/topics/${topic.id}`;
    await mutate(a.agent, a.csrf, `${path}/personal-note`, "patch")
      .send({ text: "Личный конспект" })
      .expect(200);
    await a.agent.get(path).expect(200);
    await b.agent.get(path).expect(200);
    const canonical = c.db
      .select()
      .from(topics)
      .where(eq(topics.id, topic.id))
      .get();
    const moved = await mutate(a.agent, a.csrf, `${path}/schedule`, "patch")
      .send({ date: "2026-11-20" })
      .expect(200);
    expect(moved.body.scheduledDate).toBe("2026-11-20");
    expect(moved.body.history).toContainEqual(
      expect.objectContaining({
        fromDate: "2026-11-12",
        toDate: "2026-11-20",
        kind: "manual",
        personal: true,
      }),
    );
    expect((await a.agent.get(`${path}/personal-note`)).body.text).toBe(
      "Личный конспект",
    );
    for (const agent of [b.agent, owner.agent, request.agent(app)]) {
      const other = (await agent.get(path)).body;
      expect(other.scheduledDate).toBe("2026-11-12");
      expect(other.history).not.toContainEqual(
        expect.objectContaining({ toDate: "2026-11-20" }),
      );
    }
    expect(
      c.db.select().from(topics).where(eq(topics.id, topic.id)).get(),
    ).toEqual(canonical);
    const oldWeek = await a.agent.get(
      `/api/calendars/${calendar.id}/range?start=2026-11-09&end=2026-11-16`,
    );
    const newWeek = await a.agent.get(
      `/api/calendars/${calendar.id}/range?start=2026-11-16&end=2026-11-23`,
    );
    expect(oldWeek.body.topics).toHaveLength(0);
    expect(oldWeek.body.transfers).toContainEqual(
      expect.objectContaining({ toDate: "2026-11-20", personal: true }),
    );
    expect(newWeek.body.topics.map((t: { id: string }) => t.id)).toEqual([
      topic.id,
    ]);
    // The creator's personal date must use the same overlay as a learner's.
    await mutate(owner.agent, owner.csrf, `${path}/schedule`, "patch")
      .send({ date: "2026-11-21" })
      .expect(200);
    expect(
      (await owner.agent.get(`${path}?mode=edit`)).body.scheduledDate,
    ).toBe("2026-11-12");
    expect(
      c.db.select().from(topics).where(eq(topics.id, topic.id)).get(),
    ).toEqual(canonical);
    expect(
      statistics(c, owner.user.id, "Europe/Moscow", "2026-11-16", now).planned,
    ).toBe(1);
    expect(
      statistics(c, owner.user.id, "Europe/Moscow", "2026-11-09", now).planned,
    ).toBe(0);
  });
  it("preserves completion, makes repeated moves idempotent and keeps automatic midnight carryover", async () => {
    const { calendar, topic } = await shared();
    const a = await account("schedule-done@example.test");
    const path = `/api/calendars/${calendar.id}/topics/${topic.id}`;
    await mutate(a.agent, a.csrf, `${path}/complete`, "patch")
      .send({})
      .expect(200);
    const completedAt = (await a.agent.get(path)).body.completedAt;
    for (let i = 0; i < 2; i++) {
      const moved = await mutate(a.agent, a.csrf, `${path}/schedule`, "patch")
        .send({ date: "2026-11-20" })
        .expect(200);
      expect(moved.body.status).toBe("completed");
      expect(moved.body.completedAt).toBe(completedAt);
      expect(
        moved.body.history.filter((h: { kind: string }) => h.kind === "manual"),
      ).toHaveLength(1);
    }
    await mutate(a.agent, a.csrf, `${path}/schedule`, "patch")
      .send({ date: "2026-11-12" })
      .expect(200);
    const repeatedRoute = await mutate(
      a.agent,
      a.csrf,
      `${path}/schedule`,
      "patch",
    )
      .send({ date: "2026-11-20" })
      .expect(200);
    expect(
      repeatedRoute.body.history.filter(
        (h: { kind: string }) => h.kind === "manual",
      ),
    ).toHaveLength(3);
    await mutate(a.agent, a.csrf, `${path}/schedule`, "patch")
      .send({ date: "2026-11-08" })
      .expect(200);
    expect((await a.agent.get(path)).body.completedAt).toBe(completedAt);
    await mutate(a.agent, a.csrf, `${path}/reopen`, "patch")
      .send({})
      .expect(200);
    await mutate(a.agent, a.csrf, `${path}/schedule`, "patch")
      .send({ date: "2026-11-20" })
      .expect(200);
    now = new Date("2026-11-20T21:00:00Z"); // Midnight in Moscow.
    const carried = (await a.agent.get(path)).body;
    expect(carried.status).toBe("pending");
    expect(carried.scheduledDate).toBe("2026-11-21");
    expect(carried.history).toContainEqual(
      expect.objectContaining({
        fromDate: "2026-11-20",
        toDate: "2026-11-21",
        kind: "auto",
        personal: true,
      }),
    );
  });
  it("requires login, CSRF, valid local dates and access to the requested topic for scheduling", async () => {
    const { owner, calendar, topic } = await shared();
    const reader = await account("schedule-security@example.test"),
      guest = request.agent(app);
    const path = `/api/calendars/${calendar.id}/topics/${topic.id}/schedule`;
    const csrf = (await guest.get("/api/auth/csrf")).body.csrfToken;
    await mutate(guest, csrf, path, "patch")
      .send({ date: "2026-11-20" })
      .expect(401);
    await reader.agent
      .patch(path)
      .set("Origin", origin)
      .send({ date: "2026-11-20" })
      .expect(403);
    for (const body of [
      { date: "2026-11-08" },
      { date: "2026-02-30" },
      { date: "2026-11-20T00:00:00Z" },
      { date: "2201-01-01" },
      { date: "2026-11-20", userId: owner.user.id },
    ])
      await mutate(reader.agent, reader.csrf, path, "patch")
        .send(body)
        .expect(400);
    expect(c.db.select().from(topicProgress).all()).toHaveLength(0);
    await mutate(
      reader.agent,
      reader.csrf,
      `/api/calendars/${calendar.id}/topics/missing/schedule`,
      "patch",
    )
      .send({ date: "2026-11-20" })
      .expect(404);
    // "Today" is taken in the learner's timezone, not in UTC.
    now = new Date("2026-11-09T21:05:00Z");
    await mutate(reader.agent, reader.csrf, path, "patch")
      .send({ date: "2026-11-09" })
      .expect(400);
    await mutate(reader.agent, reader.csrf, path, "patch")
      .send({ date: "2026-11-10" })
      .expect(200);
    await mutate(
      owner.agent,
      owner.csrf,
      `/api/calendars/${calendar.id}`,
      "patch",
    )
      .send({ isPublic: false })
      .expect(200);
    await mutate(reader.agent, reader.csrf, path, "patch")
      .send({ date: "2026-11-20" })
      .expect(404);
  });
  it("keeps personal notes isolated from other learners, the creator and shared responses", async () => {
    const { owner, calendar, topic } = await shared();
    const a = await account("notes-a@example.test"),
      b = await account("notes-b@example.test");
    const path = `/api/calendars/${calendar.id}/topics/${topic.id}/personal-note`;
    expect((await a.agent.get(path)).body).toEqual({
      text: "",
      updatedAt: null,
    });
    const saved = await mutate(a.agent, a.csrf, path, "patch").send({
      text: "Мой вопрос\nи пример <script>",
    });
    expect(saved.status).toBe(200);
    expect(saved.body.text).toBe("Мой вопрос\nи пример <script>");
    expect((await a.agent.get(path)).body).toEqual(saved.body);
    expect((await b.agent.get(path)).body.text).toBe("");
    expect((await owner.agent.get(path)).body.text).toBe("");
    await mutate(b.agent, b.csrf, path, "patch").send({
      text: "Другой конспект",
    });
    expect((await a.agent.get(path)).body.text).toBe(saved.body.text);
    const detailPath = `/api/calendars/${calendar.id}/topics/${topic.id}`;
    for (const agent of [a.agent, b.agent, owner.agent, request.agent(app)]) {
      const detail = await agent.get(detailPath);
      expect(detail.body.notes).toBe("Описание для всех");
      expect(JSON.stringify(detail.body)).not.toContain("Мой вопрос");
      const response = await agent.get(
        `/api/calendars/${calendar.id}/range${range}`,
      );
      expect(JSON.stringify(response.body)).not.toContain("Мой вопрос");
      expect(JSON.stringify(response.body)).not.toContain("Другой конспект");
    }
    await mutate(a.agent, a.csrf, path, "patch").send({ text: "" }).expect(200);
    expect((await a.agent.get(path)).body).toEqual({
      text: "",
      updatedAt: null,
    });
    expect((await b.agent.get(path)).body.text).toBe("Другой конспект");
  });
  it("requires authentication and calendar access for personal notes and validates input", async () => {
    const { owner, calendar, topic } = await shared();
    const reader = await account("notes-reader@example.test"),
      guest = request.agent(app);
    const path = `/api/calendars/${calendar.id}/topics/${topic.id}/personal-note`;
    expect((await guest.get(path)).status).toBe(401);
    const csrf = (await guest.get("/api/auth/csrf")).body.csrfToken;
    expect(
      (await mutate(guest, csrf, path, "patch").send({ text: "x" })).status,
    ).toBe(401);
    expect(
      (await reader.agent.patch(path).set("Origin", origin).send({ text: "x" }))
        .status,
    ).toBe(403);
    for (const input of [
      { text: 3 },
      { text: "x".repeat(100001) },
      { text: "x", userId: owner.user.id },
    ])
      expect(
        (await mutate(reader.agent, reader.csrf, path, "patch").send(input))
          .status,
      ).toBe(400);
    const missing = `/api/calendars/${calendar.id}/topics/missing/personal-note`;
    expect((await reader.agent.get(missing)).status).toBe(404);
    await mutate(reader.agent, reader.csrf, path, "patch").send({
      text: "Приватно",
    });
    await mutate(
      owner.agent,
      owner.csrf,
      `/api/calendars/${calendar.id}`,
      "patch",
    ).send({ isPublic: false });
    expect((await reader.agent.get(path)).status).toBe(404);
    expect(
      (
        await mutate(reader.agent, reader.csrf, path, "patch").send({
          text: "Нельзя",
        })
      ).status,
    ).toBe(404);
  });
  it("preserves notes through progress and plan changes and removes them with their topic", async () => {
    const { owner, calendar, topic } = await shared();
    const path = `/api/calendars/${calendar.id}/topics/${topic.id}/personal-note`;
    await mutate(owner.agent, owner.csrf, path, "patch").send({
      text: "Не потерять",
    });
    await mutate(
      owner.agent,
      owner.csrf,
      `/api/calendars/${calendar.id}/topics/${topic.id}/complete`,
      "patch",
    ).send({});
    await mutate(
      owner.agent,
      owner.csrf,
      `/api/topics/${topic.id}`,
      "patch",
    ).send({ notes: "Новое описание", scheduledDate: "2026-11-15" });
    expect((await owner.agent.get(path)).body.text).toBe("Не потерять");
    await mutate(
      owner.agent,
      owner.csrf,
      `/api/topics/${topic.id}`,
      "delete",
    ).expect(200);
    expect(c.db.select().from(personalNotes).all()).toHaveLength(0);
  });
  it("opens a real monthly starter calendar without authentication, with no personal achievements", async () => {
    const list = await request(app).get("/api/calendars");
    expect(list.status).toBe(200);
    const cal = list.body.calendars.find(
      (x: { isDefault: boolean }) => x.isDefault,
    );
    expect(cal.role).toBe("reader");
    const first = await request(app).get(
      `/api/calendars/${cal.id}/range${range}`,
    );
    expect(first.status).toBe(200);
    expect(first.body.topics).toHaveLength(16);
    expect(first.body.stats.completed).toBe(0);
    expect(
      first.body.topics.every(
        (t: { status: string }) => t.status === "pending",
      ),
    ).toBe(true);
    expect(first.body.topics[0].resources.length).toBeGreaterThan(0);
    await request(app).get("/api/calendars");
    expect(c.db.select().from(topics).all()).toHaveLength(45);
  });
  it("requires login to mark a topic, while allowing anonymous topic details", async () => {
    const { calendar, topic } = await shared();
    const guest = request.agent(app);
    expect(
      (await guest.get(`/api/calendars/${calendar.id}/topics/${topic.id}`))
        .status,
    ).toBe(200);
    const csrf = (await guest.get("/api/auth/csrf")).body.csrfToken;
    expect(
      (
        await mutate(
          guest,
          csrf,
          `/api/calendars/${calendar.id}/topics/${topic.id}/complete`,
          "patch",
        )
      ).status,
    ).toBe(401);
  });
  it("keeps completion private and does not modify the shared plan", async () => {
    const { owner, calendar, topic } = await shared(),
      a = await account("learner-a@example.test"),
      b = await account("learner-b@example.test");
    expect(
      (
        await mutate(
          a.agent,
          a.csrf,
          `/api/calendars/${calendar.id}/topics/${topic.id}/complete`,
          "patch",
        )
      ).status,
    ).toBe(200);
    const path = `/api/calendars/${calendar.id}/topics/${topic.id}`;
    expect((await a.agent.get(path)).body.status).toBe("completed");
    expect((await b.agent.get(path)).body.status).toBe("pending");
    expect((await owner.agent.get(path)).body.status).toBe("pending");
    expect((await request(app).get(path)).body.status).toBe("pending");
    expect(
      c.db.select().from(topics).where(eq(topics.id, topic.id)).get()!.status,
    ).toBe("pending");
    expect((await a.agent.get("/api/stats/overview")).body.totalCompleted).toBe(
      1,
    );
    expect((await b.agent.get("/api/stats/overview")).body.totalCompleted).toBe(
      0,
    );
    const firstCompletion = (await a.agent.get(path)).body.completedAt;
    now = new Date("2026-11-15T12:00:00Z");
    await mutate(a.agent, a.csrf, `${path}/complete`, "patch");
    const stillDone = (await a.agent.get(path)).body;
    expect(stillDone.completedAt).toBe(firstCompletion);
    expect(stillDone.scheduledDate).toBe("2026-11-12");
    expect((await b.agent.get(path)).body.scheduledDate).toBe("2026-11-15");
  });
  it("denies reader mutations of metadata, topics, dates, resources and the edit space", async () => {
    const { calendar, topic } = await shared(),
      reader = await account("reader@example.test");
    expect(
      (
        await mutate(
          reader.agent,
          reader.csrf,
          `/api/calendars/${calendar.id}`,
          "patch",
        ).send({ title: "Hacked", isPublic: false })
      ).status,
    ).toBe(403);
    expect(
      (
        await mutate(reader.agent, reader.csrf, "/api/topics").send({
          title: "Hacked",
          scheduledDate: "2026-11-12",
          calendarId: calendar.id,
        })
      ).status,
    ).toBe(403);
    for (const action of ["patch", "delete"] as const)
      expect(
        (
          await mutate(
            reader.agent,
            reader.csrf,
            `/api/topics/${topic.id}`,
            action,
          ).send({ title: "Hacked", scheduledDate: "2026-11-15" })
        ).status,
      ).toBe(404);
    expect(
      (
        await mutate(
          reader.agent,
          reader.csrf,
          `/api/topics/${topic.id}/resources`,
        ).send({ title: "Hack", url: "https://go.dev/" })
      ).status,
    ).toBe(404);
    expect(
      (
        await mutate(
          reader.agent,
          reader.csrf,
          `/api/calendars/${calendar.id}/plan`,
        ).send({ start: "2026-11-09" })
      ).status,
    ).toBe(403);
    expect(
      (
        await reader.agent.get(
          `/api/calendars/${calendar.id}/range${range}&mode=edit`,
        )
      ).status,
    ).toBe(403);
  });
  it("lets only the creator publish a private calendar and preserves privacy when unpublished", async () => {
    const owner = await account(),
      reader = await account("reader@example.test");
    const cal = (
      await mutate(owner.agent, owner.csrf, "/api/calendars").send({
        title: "Личный",
      })
    ).body;
    const path = `/api/calendars/${cal.id}/range${range}`;
    expect((await request(app).get(path)).status).toBe(404);
    expect((await reader.agent.get(path)).status).toBe(404);
    expect((await owner.agent.get(path + "&mode=edit")).status).toBe(200);
    expect(
      (
        await mutate(
          owner.agent,
          owner.csrf,
          `/api/calendars/${cal.id}`,
          "patch",
        ).send({ isPublic: true })
      ).status,
    ).toBe(200);
    expect((await request(app).get(path)).status).toBe(200);
    await mutate(
      owner.agent,
      owner.csrf,
      `/api/calendars/${cal.id}`,
      "patch",
    ).send({ isPublic: false });
    expect((await request(app).get(path)).status).toBe(404);
    const catalog = (await reader.agent.get("/api/calendars")).body.calendars;
    expect(catalog.some((x: { id: string }) => x.id === cal.id)).toBe(false);
  });
  it("separates canonical dates in the editor from each learner’s automatic carryover", async () => {
    const { owner, calendar, topic } = await shared(),
      a = await account("learner@example.test");
    await a.agent.get(`/api/calendars/${calendar.id}/range${range}`);
    now = new Date("2026-11-15T12:00:00Z");
    const learner = await a.agent.get(
      `/api/calendars/${calendar.id}/topics/${topic.id}`,
    );
    expect(learner.body.scheduledDate).toBe("2026-11-15");
    expect(
      learner.body.history.filter((h: { kind: string }) => h.kind === "auto"),
    ).toHaveLength(1);
    await a.agent.get(`/api/calendars/${calendar.id}/topics/${topic.id}`);
    expect(
      (
        await a.agent.get(`/api/calendars/${calendar.id}/topics/${topic.id}`)
      ).body.history.filter((h: { kind: string }) => h.kind === "auto"),
    ).toHaveLength(1);
    expect(
      (
        await owner.agent.get(
          `/api/calendars/${calendar.id}/topics/${topic.id}?mode=edit`,
        )
      ).body.scheduledDate,
    ).toBe("2026-11-12");
    expect(
      (
        await request(app).get(
          `/api/calendars/${calendar.id}/topics/${topic.id}`,
        )
      ).body.scheduledDate,
    ).toBe("2026-11-12");
    await mutate(
      owner.agent,
      owner.csrf,
      `/api/topics/${topic.id}`,
      "patch",
    ).send({ scheduledDate: "2026-11-18" });
    expect(
      (await a.agent.get(`/api/calendars/${calendar.id}/topics/${topic.id}`))
        .body.scheduledDate,
    ).toBe("2026-11-18");
  });
  it("validates month ranges and excludes adjacent-month cells from statistics", async () => {
    const { calendar } = await shared();
    expect(
      (
        await request(app).get(
          `/api/calendars/${calendar.id}/range?start=2026-11-01&end=2027-01-01`,
        )
      ).status,
    ).toBe(400);
    const r = await request(app).get(
      `/api/calendars/${calendar.id}/range?start=2026-10-26&end=2026-12-07&periodStart=2026-11-01&periodEnd=2026-12-01`,
    );
    expect(r.status).toBe(200);
    expect(r.body.stats.activity).toHaveLength(30);
  });
});

it("migrates existing private data without publishing it or losing progress and resources", () => {
  const dir = mkdtempSync(join(tmpdir(), "studyflow-migration-"));
  const path = join(dir, "old.sqlite");
  const legacy = new Database(path);
  try {
    legacy.exec(
      readFileSync(
        new URL("../src/db/migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    legacy.exec(
      "CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
    );
    legacy
      .prepare("INSERT INTO migrations VALUES (?,?)")
      .run("0001_initial", now.toISOString());
    legacy
      .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)")
      .run(
        "existing",
        "existing@example.test",
        "hash",
        "Существующий автор",
        "Europe/Moscow",
        1,
        now.toISOString(),
        now.toISOString(),
      );
    legacy
      .prepare("INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        "legacy-topic",
        "existing",
        "Важная тема",
        "Личные заметки",
        "completed",
        "2026-11-01",
        "2026-11-02",
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
      );
    legacy
      .prepare("INSERT INTO resources VALUES(?,?,?,?)")
      .run("legacy-resource", "legacy-topic", "Go", "https://go.dev/doc/");
    legacy.close();
    const migrated = connect(path);
    try {
      expect(
        migrated.sqlite
          .prepare("SELECT is_public,owner_id FROM calendars")
          .get(),
      ).toMatchObject({ is_public: 0, owner_id: "existing" });
      expect(
        migrated.sqlite
          .prepare("SELECT calendar_id,notes,plan_date FROM topics")
          .get(),
      ).toMatchObject({
        calendar_id: "personal-existing",
        notes: "Личные заметки",
        plan_date: "2026-11-02",
      });
      expect(
        migrated.sqlite
          .prepare("SELECT completed_at,scheduled_date FROM topic_progress")
          .get(),
      ).toMatchObject({
        completed_at: now.toISOString(),
        scheduled_date: "2026-11-02",
      });
      expect(migrated.db.select().from(resources).all()).toHaveLength(1);
    } finally {
      migrated.sqlite.close();
    }
  } finally {
    if (legacy.open) legacy.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
