import { afterEach, describe, it, expect, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
describe("Browser API client session transitions", () => {
  it("refreshes CSRF before a new login even when a previous session token is cached", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrfToken: "initial" }))
      .mockResolvedValueOnce(json({ csrfToken: "rotated", user: { id: "a" } }))
      .mockResolvedValueOnce(json({ csrfToken: "new-session" }))
      .mockResolvedValueOnce(
        json({ csrfToken: "logged-in", user: { id: "b" } }),
      );
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../../front/src/services/api");
    await api("/auth/register", "POST", {});
    await api("/auth/login", "POST", {});
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "/api/auth/csrf",
      "/api/auth/register",
      "/api/auth/csrf",
      "/api/auth/login",
    ]);
    expect(fetch.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("new-session");
  });
  it("clears CSRF on logout before a subsequent mutation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ csrfToken: "initial" }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ csrfToken: "anonymous" }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../../front/src/services/api");
    await api("/auth/logout", "POST");
    await api("/topics", "POST", {});
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "/api/auth/csrf",
      "/api/auth/logout",
      "/api/auth/csrf",
      "/api/topics",
    ]);
    expect(fetch.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("anonymous");
  });
  it("shows a readable error when the backend restarts and returns an empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 502 })),
    );
    const { api } = await import("../../front/src/services/api");
    await expect(api("/calendars")).rejects.toThrow(
      "Сервер временно недоступен",
    );
  });
});
