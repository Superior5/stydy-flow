import { sqliteTable, text, integer, index, primaryKey, } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    planHandled: integer("plan_handled", { mode: "boolean" })
        .notNull()
        .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
});
export const calendars = sqliteTable("calendars", {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    curriculumVersion: integer("curriculum_version").notNull().default(0),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    isDefault: integer("is_default", { mode: "boolean" })
        .notNull()
        .default(false),
    createdAt: text("created_at").notNull(),
});
export const topics = sqliteTable("topics", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").references(() => calendars.id, {
        onDelete: "cascade",
    }),
    planDate: text("plan_date"),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status", { enum: ["pending", "completed"] })
        .notNull()
        .default("pending"),
    originalDate: text("original_date").notNull(),
    scheduledDate: text("scheduled_date").notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
}, (t) => [index("topics_user_date").on(t.userId, t.scheduledDate)]);
export const resources = sqliteTable("resources", {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
        .notNull()
        .references(() => topics.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
});
export const transfers = sqliteTable("transfers", {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
        .notNull()
        .references(() => topics.id, { onDelete: "cascade" }),
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    kind: text("kind", { enum: ["auto", "manual"] }).notNull(),
    createdAt: text("created_at").notNull(),
});
export const topicProgress = sqliteTable("topic_progress", {
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
        .notNull()
        .references(() => topics.id, { onDelete: "cascade" }),
    completedAt: text("completed_at"),
    scheduledDate: text("scheduled_date"),
    history: text("history").notNull().default("[]"),
}, (t) => [primaryKey({ columns: [t.userId, t.topicId] })]);
export const personalNotes = sqliteTable("personal_notes", {
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
        .notNull()
        .references(() => topics.id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.topicId] })]);
