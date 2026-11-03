// One way to call TikTok's Business API from edge functions: GET with query params, POST with a JSON body,
// 20 s timeout, and TikTok's {code, message, data} envelope unwrapped. Throws with TikTok's message.

export const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

export class TikTokApiError extends Error {
  constructor(
    readonly path: string,
    readonly code: number,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

export async function tiktokApi<T = Record<string, unknown>>(
  path: string,
  token: string,
  opts: { body?: unknown; params?: Record<string, string> } = {},
): Promise<T> {
  const url = `${TIKTOK_API}/${path}${opts.params ? `?${new URLSearchParams(opts.params)}` : ""}`;
  const res = await fetch(url, {
    method: opts.body === undefined ? "GET" : "POST",
    headers: { "Access-Token": token, ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({ code: -1, message: `Unreadable response (${res.status})` }))) as {
    code?: number;
    message?: string;
    data?: T;
  };
  if (json.code !== 0) throw new TikTokApiError(path, json.code ?? -1, json.message ?? "Unknown error");
  return (json.data ?? {}) as T;
}
