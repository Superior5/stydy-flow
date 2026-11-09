let csrf = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (
    method !== "GET" &&
    (!csrf || path === "/auth/login" || path === "/auth/register")
  ) {
    const r = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    csrf = (await r.json()).csrfToken;
  }
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "Сервер временно недоступен. Повторите запрос через несколько секунд.",
      response.ok ? 503 : response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 403) csrf = "";
    throw new ApiError(
      data.error?.message || "Не удалось выполнить запрос",
      response.status,
    );
  }
  if (path === "/auth/logout") csrf = "";
  if (data.csrfToken) csrf = data.csrfToken;
  return data;
}
