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
