export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/** Scheduled functions are only callable with the platform cron secret. */
export function isAuthorizedCron(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return false;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("cron_secret");
  return provided === expected;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function logJob(
  supabase: any,
  jobName: string,
  payload: {
    clientId?: string | null;
    status: string;
    details?: Record<string, unknown>;
    error?: string | null;
  }
) {
  await supabase.from("integration_jobs").insert({
    job_name: jobName,
    client_id: payload.clientId ?? null,
    status: payload.status,
    details: payload.details ?? {},
    error_message: payload.error ?? null,
    finished_at: new Date().toISOString(),
  });
}
