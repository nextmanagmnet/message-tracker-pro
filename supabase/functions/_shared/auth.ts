import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json } from "./cron.ts";

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Verifies the caller's JWT and that they may access clientId. Returns a Response on failure.
export async function authorizeClient(
  req: Request,
  clientId: unknown,
): Promise<{ userId: string; supabase: any } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !data?.claims) return json({ error: "Unauthorized" }, 401);
  if (typeof clientId !== "string" || !clientId) return json({ error: "clientId is required" }, 400);

  const supabase = serviceClient();
  const userId = data.claims.sub as string;
  const { data: canAccess } = await supabase.rpc("user_can_access_client", { _user_id: userId, _client_id: clientId });
  if (!canAccess) return json({ error: "Access denied" }, 403);
  return { userId, supabase };
}

// Internal calls (webhook -> ai-agent) carry the service role key.
export function isInternalCall(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!key && req.headers.get("x-internal-key") === key;
}

export function limitError(e: { message?: string } | null | undefined) {
  return e?.message?.includes("WOB_LIMIT:")
    ? json({ error: e.message.split("WOB_LIMIT:")[1].trim() || "Plan limit reached", code: "limit" }, 409)
    : null;
}
