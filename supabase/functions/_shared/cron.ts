import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

export { corsHeaders };

/**
 * Scheduled functions accept either the platform CRON_SECRET or the
 * database scheduler token (stored in a service-role-only table).
 */
// Compares in constant time so a wrong guess leaks nothing about how much of the secret was right.
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function isAuthorizedCron(req: Request, supabase: SupabaseClient): Promise<boolean> {
  // Header only: a secret in the address would end up in logs and browser history.
  const provided = req.headers.get("x-cron-secret");
  if (!provided) return false;
  const envSecret = Deno.env.get("CRON_SECRET");
  if (envSecret && sameSecret(provided, envSecret)) return true;
  const { data } = await supabase.from("scheduler_config").select("cron_token").eq("id", 1).maybeSingle();
  return Boolean(data?.cron_token) && sameSecret(provided, data.cron_token);
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function logJob(
  supabase: SupabaseClient,
  jobName: string,
  payload: {
    clientId?: string | null;
    status: string;
    details?: Record<string, unknown>;
    error?: string | null;
  },
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
