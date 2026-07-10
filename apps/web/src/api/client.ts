export const API_URL: string =
  (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:3001";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const res = await fetch(`${API_URL}${path}`, init);

  const contentType = res.headers.get("content-type") ?? "";
  const parsed: unknown = contentType.includes("application/json") ? await res.json() : null;
  const errorCode =
    parsed !== null &&
    typeof parsed === "object" &&
    "error" in parsed &&
    typeof parsed.error === "string"
      ? parsed.error
      : undefined;

  if (!res.ok) {
    throw new ApiRequestError(errorCode ?? res.statusText, errorCode, res.status);
  }
  return parsed as T;
}
