import session from "express-session";
/** Persist sessions in the same WAL database; never store account data in memory. */
export class SQLiteSessionStore extends session.Store {
    sqlite;
    timer;
    constructor(sqlite) {
        super();
        this.sqlite = sqlite;
        this.timer = setInterval(() => {
            sqlite
                .prepare("DELETE FROM sessions WHERE expires < ?")
                .run(Date.now());
        }, 60 * 60 * 1000);
        this.timer.unref();
    }
    close() {
        clearInterval(this.timer);
    }
    get(sid, cb) {
        try {
            const row = this.sqlite
                .prepare("SELECT data FROM sessions WHERE sid=? AND expires>?")
                .get(sid, Date.now());
            cb(null, row ? JSON.parse(row.data) : null);
        }
        catch (e) {
            cb(e);
        }
    }
    set(sid, data, cb) {
        try {
            this.sqlite
                .prepare("INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires")
                .run(sid, JSON.stringify(data), data.cookie.expires
                ? new Date(data.cookie.expires).getTime()
                : Date.now() + 30 * 86400000);
            cb?.();
        }
        catch (e) {
            cb?.(e);
        }
    }
    destroy(sid, cb) {
        try {
            this.sqlite.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
            cb?.();
        }
        catch (e) {
            cb?.(e);
        }
    }
    touch(sid, data, cb) {
        this.set(sid, data, cb);
    }
}
