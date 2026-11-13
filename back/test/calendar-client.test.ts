import { beforeEach, describe, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
vi.mock("../../front/src/services/api", () => ({
  api: vi.fn(),
  ApiError: class extends Error {},
}));
vi.mock("../../front/src/stores/ui", () => ({
  useUI: () => ({ notify: vi.fn() }),
}));
import { api } from "../../front/src/services/api";
import { useCalendar } from "../../front/src/composables/calendar";
import { useAuth } from "../../front/src/stores/auth";
import type { Topic } from "../../front/src/types";
const topic: Topic = {
  id: "topic",
  title: "Go",
  notes: "",
  scheduledDate: "2026-11-09",
  originalDate: "2026-11-09",
  status: "pending",
  completedAt: null,
  resources: [],
  history: [],
};
beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(api).mockReset();
});
function mockServer(status: "pending" | "completed") {
  vi.mocked(api).mockImplementation(async (path, method) => {
    if (path === "/calendars")
      return {
        calendars: [
          {
            id: "calendar",
            ownerId: "author",
            role: "reader",
            isDefault: true,
            title: "Plan",
          },
        ],
      };
    if (path.endsWith("/topics/topic") && method !== "PATCH")
      return { ...topic, status };
    if (path.includes("/range?"))
      return {
        topics: [{ ...topic, status: "completed" }],
        transfers: [],
        stats: {},
        today: "2026-11-09",
      };
    return { ok: true };
  });
}
async function signIn() {
  const auth = useAuth();
  auth.user = {
    id: "learner",
    email: "learner@example.test",
    name: "Reader",
    timezone: "UTC",
    planHandled: false,
  };
  await nextTick();
  await auth.finishAuth();
}
describe("Deferred completion after authentication", () => {
  it("does not change a guest checkbox before login, and keeps a previously completed topic completed", async () => {
    mockServer("completed");
    const calendar = useCalendar(),
      auth = useAuth();
    calendar.calendarId = "calendar";
    const card = { ...topic };
    await calendar.toggle(card);
    expect(auth.authOpen).toBe(true);
    expect(card.status).toBe("pending");
    expect(api).not.toHaveBeenCalled();
    await signIn();
    expect(auth.authOpen).toBe(false);
    expect(
      vi.mocked(api).mock.calls.filter((call) => call[1] === "PATCH"),
    ).toHaveLength(0);
    expect(calendar.week?.topics[0].status).toBe("completed");
  });
  it("continues the intended completion against the selected calendar after login", async () => {
    mockServer("pending");
    const calendar = useCalendar();
    calendar.calendarId = "calendar";
    await calendar.toggle({ ...topic });
    await signIn();
    expect(
      vi.mocked(api).mock.calls.filter((call) => call[1] === "PATCH"),
    ).toEqual([["/calendars/calendar/topics/topic/complete", "PATCH"]]);
  });
});

describe("Personal scheduling interactions", () => {
  const destination = "2027-01-05";
  function scheduleServer() {
    const moved = {
      ...topic,
      scheduledDate: destination,
      history: [
        {
          id: "move",
          topicId: topic.id,
          fromDate: topic.scheduledDate,
          toDate: destination,
          kind: "manual" as const,
          personal: true,
          createdAt: "2026-11-09T09:00:00Z",
        },
      ],
    };
    vi.mocked(api).mockImplementation(async (path, method) => {
      if (path === "/calendars")
        return {
          calendars: [{ id: "calendar", ownerId: "author", isDefault: true }],
        };
      if (path.endsWith("/schedule") && method === "PATCH") return moved;
      if (path.endsWith("/topics/topic")) return { ...topic };
      if (path.includes("/range?"))
        return {
          start: "2026-11-09",
          today: "2026-11-09",
          topics: [],
          transfers: [],
          stats: {},
        };
      return { ok: true };
    });
    return moved;
  }
  it("moves the dragged topic using the personal endpoint and clears the drag state", async () => {
    scheduleServer();
    const calendar = useCalendar();
    await signIn();
    calendar.calendarId = "calendar";
    await nextTick();
    const card = { ...topic };
    calendar.beginDrag(card);
    expect(calendar.canDrop(destination)).toBe(true);
    expect(calendar.canDrop(topic.scheduledDate)).toBe(false);
    await calendar.dropTopic(destination);
    expect(api).toHaveBeenCalledWith(
      "/calendars/calendar/topics/topic/schedule",
      "PATCH",
      { date: destination },
    );
    expect(card.scheduledDate).toBe(destination);
    expect(calendar.dragging).toBeNull();
    expect(calendar.moving.size).toBe(0);
  });
  it("requests login before a guest drop is saved, then continues the intended date", async () => {
    scheduleServer();
    const calendar = useCalendar(),
      auth = useAuth();
    calendar.calendarId = "calendar";
    await nextTick();
    const card = { ...topic };
    calendar.beginDrag(card);
    await calendar.dropTopic(destination);
    expect(auth.authOpen).toBe(true);
    expect(card.scheduledDate).toBe(topic.scheduledDate);
    expect(api).not.toHaveBeenCalled();
    await signIn();
    expect(api).toHaveBeenCalledWith(
      "/calendars/calendar/topics/topic/schedule",
      "PATCH",
      { date: destination },
    );
  });
  it("highlights only allowed dates and ignores a release outside the calendar or in the past", async () => {
    scheduleServer();
    const calendar = useCalendar();
    calendar.calendarId = "calendar";
    await nextTick();
    calendar.beginDrag({ ...topic });
    calendar.hoverDate(destination);
    expect(calendar.dropDate).toBe(destination);
    calendar.hoverDate("2020-01-01");
    expect(calendar.dropDate).toBe("");
    await calendar.dropTopic("2020-01-01");
    expect(api).not.toHaveBeenCalled();
    expect(calendar.dragging).toBeNull();
    calendar.beginDrag({ ...topic });
    await calendar.dropTopic("");
    expect(api).not.toHaveBeenCalled();
    expect(calendar.dragging).toBeNull();
  });
  it("does not treat external drops as topics and does not allow moving in the plan editor", async () => {
    scheduleServer();
    const calendar = useCalendar();
    calendar.calendarId = "calendar";
    await nextTick();
    await calendar.dropTopic(destination);
    expect(api).not.toHaveBeenCalled();
    calendar.editing = true;
    expect(calendar.beginDrag({ ...topic })).toBe(false);
    expect(calendar.dragging).toBeNull();
    await calendar.reschedule({ ...topic }, destination);
    calendar.openSchedule({ ...topic });
    expect(calendar.scheduleRequest).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
  it("keeps the original date on server failure and cancels a drag after a calendar switch", async () => {
    scheduleServer();
    const calendar = useCalendar();
    await signIn();
    calendar.calendarId = "calendar";
    await nextTick();
    const card = { ...topic };
    vi.mocked(api).mockRejectedValueOnce(new Error("Не удалось сохранить"));
    await expect(calendar.reschedule(card, destination)).rejects.toThrow(
      "Не удалось сохранить",
    );
    expect(card.scheduledDate).toBe(topic.scheduledDate);
    expect(calendar.moving.size).toBe(0);
    calendar.beginDrag(card);
    calendar.calendarId = "other";
    await nextTick();
    expect(calendar.dragging).toBeNull();
    expect(calendar.canDrop(destination)).toBe(false);
  });
});
