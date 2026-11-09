import Database from "better-sqlite3";
import { config } from "dotenv";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: resolve(root, ".env"), quiet: true });
const source = resolve(
  root,
  "back",
  process.env.DATABASE_PATH || "./data/studyflow.sqlite",
);
const destination = resolve(
  process.argv[2] ||
    resolve(
      root,
      "backups",
      `studyflow-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
    ),
);
if (source === destination)
  throw new Error("Backup destination must differ from the database path");
await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  const file = await open(destination, "wx", 0o600);
  await file.close();
  await db.backup(destination);
  console.log(`SQLite backup saved: ${destination}`);
} finally {
  db.close();
}
