import type { ErrorEvent } from "@sentry/react";

// Sentry is loaded lazily and only when VITE_SENTRY_DSN is set, so the main bundle is unaffected otherwise.
type SentryModule = typeof import("@sentry/react");
let sentry: Promise<SentryModule> | null = null;

/** Strip everything that could identify a person or carry content; keep only the opaque user id. */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

export const IGNORED_ERRORS = [
  /ResizeObserver loop/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Load failed/i,
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
];

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || sentry) return;
  sentry = import("@sentry/react");
  void sentry.then((S) =>
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.05,
      sendDefaultPii: false,
      ignoreErrors: IGNORED_ERRORS,
      beforeSend: scrubEvent,
    }),
  ).catch(() => {
    sentry = null; // monitoring must never break the app
  });
}

/** Tag events with the Supabase user id only (no email / ip). */
export function setMonitoringUser(id: string | null): void {
  void sentry?.then((S) => S.setUser(id ? { id } : null)).catch(() => {});
}

export function captureError(error: unknown, componentStack?: string | null): void {
  void sentry
    ?.then((S) =>
      S.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined),
    )
    .catch(() => {});
}
