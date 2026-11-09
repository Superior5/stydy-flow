import session from "express-session";
import type Database from "better-sqlite3";
/** Persist sessions in the same WAL database; never store account data in memory. */
export class SQLiteSessionStore extends session.Store {
  private timer: ReturnType<typeof setInterval>;
  constructor(private sqlite: Database.Database) {
    super();
    this.timer = setInterval(
      () => {
        sqlite
          .prepare("DELETE FROM sessions WHERE expires < ?")
          .run(Date.now());
      },
      60 * 60 * 1000,
    );
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
  }
  get(
    sid: string,
    cb: (err: unknown, data?: session.SessionData | null) => void,
  ) {
    try {
      const row = this.sqlite
        .prepare("SELECT data FROM sessions WHERE sid=? AND expires>?")
        .get(sid, Date.now()) as { data: string } | undefined;
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(sid: string, data: session.SessionData, cb?: (err?: unknown) => void) {
    try {
      this.sqlite
        .prepare(
          "INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires",
        )
        .run(
          sid,
          JSON.stringify(data),
          data.cookie.expires
            ? new Date(data.cookie.expires).getTime()
            : Date.now() + 30 * 86400000,
        );
      cb?.();
    } catch (e) {
      cb?.(e);
    }
  }
  destroy(sid: string, cb?: (err?: unknown) => void) {
    try {
      this.sqlite.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      cb?.();
    } catch (e) {
      cb?.(e);
    }
  }
  touch(sid: string, data: session.SessionData, cb?: (err?: unknown) => void) {
    this.set(sid, data, cb);
  }
}
