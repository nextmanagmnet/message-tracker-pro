export const JOIN_TOKEN_KEY = "wob-join-token";

// Storage can throw (private windows, blocked site data); a lost token just means asking for a new link.
export function getJoinToken(): string | null {
  try {
    return localStorage.getItem(JOIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setJoinToken(token: string): void {
  try {
    localStorage.setItem(JOIN_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearJoinToken(): void {
  try {
    localStorage.removeItem(JOIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** A signed-in user with a waiting invite is sent to /join, except on the pages that finish the sign-in. */
export function shouldRedirect(path: string, hasToken: boolean, signedIn: boolean): boolean {
  return hasToken && signedIn && path !== "/join" && path !== "/auth";
}

export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
