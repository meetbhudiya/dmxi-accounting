const TOKEN_KEY = "dmxi_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;


  const res = await fetch(`/api${path}`, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    try {
      const body = await res.json();
      details = body;
      if (typeof body?.error === "string") {
        message = body.error;
      } else if (body?.error && typeof body.error === "object") {
        // Zod flatten format: { fieldErrors: { field: [msg] }, formErrors: [msg] }
        const fieldErrors = body.error.fieldErrors ?? {};
        const formErrors: string[] = body.error.formErrors ?? [];
        const fieldMessages = Object.entries(fieldErrors)
          .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
          .join("; ");
        const all = [...formErrors, ...(fieldMessages ? [fieldMessages] : [])];
        if (all.length) message = all.join("; ");
      } else if (typeof body?.message === "string") {
        message = body.message;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method: "GET", headers });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? "dmxi-export.dmxi";
  return { blob: await res.blob(), filename };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  getBlob: (path: string) => requestBlob(path),
};
