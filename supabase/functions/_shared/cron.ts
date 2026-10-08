export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Scheduled functions accept either the platform CRON_SECRET or the
 * database scheduler token (stored in a service-role-only table).
 */
export async function isAuthorizedCron(req: Request, supabase: any): Promise<boolean> {
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("cron_secret");
  if (!provided) return false;
  const envSecret = Deno.env.get("CRON_SECRET");
  if (envSecret && provided === envSecret) return true;
  const { data } = await supabase
    .from("scheduler_config")
    .select("cron_token")
    .eq("id", 1)
    .maybeSingle();
  return Boolean(data?.cron_token) && provided === data.cron_token;
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
