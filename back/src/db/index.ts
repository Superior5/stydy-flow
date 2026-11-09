import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";
const migrationNames = [
  "0001_initial",
  "0002_calendars",
  "0003_personal_schedule",
  "0004_personal_notes",
  "0005_curriculum_version",
];
export function connect(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  sqlite.transaction(() => {
    for (const name of migrationNames) {
      if (sqlite.prepare("SELECT name FROM migrations WHERE name=?").get(name))
        continue;
      const migration = readFileSync(
        new URL(`../../src/db/migrations/${name}.sql`, import.meta.url),
        "utf8",
      );
      sqlite.exec(migration);
      sqlite
        .prepare("INSERT INTO migrations VALUES (?,?)")
        .run(name, new Date().toISOString());
    }
  })();
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type Connection = ReturnType<typeof connect>;
