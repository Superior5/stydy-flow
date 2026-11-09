import { config } from "dotenv";
config({ path: ["../.env", ".env"], quiet: true });
export const production = process.env.NODE_ENV === "production";
export const settings = {
  port: Number(process.env.PORT || 3007),
  database: process.env.DATABASE_PATH || "./data/studyflow.sqlite",
  secret:
    process.env.SESSION_SECRET || "studyflow-local-development-secret-only",
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
};
if (production && (!process.env.SESSION_SECRET || settings.secret.length < 32))
  throw new Error("Set SESSION_SECRET to at least 32 characters in production");
