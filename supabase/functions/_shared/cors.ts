// Allow-Origin is set per request by withCors, from the APP_ORIGINS allowlist.
export const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-region",
};

// APP_ORIGINS: comma-separated site origins, e.g. https://wob.vercel.app,https://app.wob.com
export const appOrigins = (raw: string | null | undefined) =>
  (raw ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

// The caller's origin when allowed, else the first allowed one.
export function allowOrigin(origin: string | null, allowed: string[]): string {
  if (allowed.length === 0) return "*"; // APP_ORIGINS unset (local/dev): stay open
  const asked = origin?.replace(/\/$/, "") ?? "";
  return allowed.includes(asked) ? asked : allowed[0];
}

// Wraps a Deno.serve handler so every response (preflight included) carries the allowlisted origin.
export function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const out = new Response(res.body, res);
    out.headers.set(
      "Access-Control-Allow-Origin",
      allowOrigin(req.headers.get("Origin"), appOrigins(Deno.env.get("APP_ORIGINS"))),
    );
    out.headers.append("Vary", "Origin");
    return out;
  };
}
