import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { calendars } from "../db/schema.js";
export function personalCalendar(c, userId) {
    const existing = c.db
        .select()
        .from(calendars)
        .where(eq(calendars.ownerId, userId))
        .all()
        .find((x) => !x.isDefault);
    if (existing)
        return existing;
    const calendar = {
        id: randomUUID(),
        ownerId: userId,
        title: "Мой учебный план",
        isPublic: false,
        isDefault: false,
        createdAt: new Date().toISOString(),
    };
    c.db.insert(calendars).values(calendar).run();
    return calendar;
}
