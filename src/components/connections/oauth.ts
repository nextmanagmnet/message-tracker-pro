export type PendingOAuth = { clientId: string; state: string; createdAt: number };

export const TIKTOK_KEY = "tiktok_oauth_pending";

export function beginOAuth(key: string, clientId: string): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ clientId, state, createdAt: Date.now() } satisfies PendingOAuth));
  return state;
}

export function readPending(key: string): PendingOAuth | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PendingOAuth) : null;
  } catch {
    return null;
  }
}
