import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json } from "./cron.ts";

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Verifies the caller's JWT and that they may access clientId. Returns a Response on failure.
export async function authorizeClient(
  req: Request,
  clientId: unknown,
): Promise<{ userId: string; supabase: SupabaseClient } | Response> {
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

// What an admin can be limited to (owners always have all of them). Mirrors has_agency_permission in the database.
export type AgencyPermission = "clients" | "funding" | "ad_accounts" | "campaigns";

// Who may run ads on a client's ad account: the client's own agency owners/admins, or staff of the agency that
// manages the account through an active link the user has not switched off (needs the "campaigns" permission).
// `managed` tells the caller this is someone else's account, so private details (phone numbers…) must be masked.
export async function authorizeCampaigns(
  req: Request,
  clientId: unknown,
): Promise<{ userId: string; supabase: SupabaseClient; managed: boolean } | Response> {
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
  const { data: client } = await supabase.from("clients").select("agency_id").eq("id", clientId).maybeSingle();
  if (!client) return json({ error: "Access denied" }, 403);

  // Own client of the caller's agency: owners and admins, as before.
  const { data: own } = await supabase.rpc("has_agency_permission", {
    _user_id: userId,
    _agency_id: client.agency_id,
    _perm: "campaigns",
  });
  if (own) return { userId, supabase, managed: false };

  const { data: managed } = await supabase.rpc("agency_can_run_ads", { p_user: userId, p_client: clientId });
  if (managed) return { userId, supabase, managed: true };
  return json({ error: "You can't run ads for this account", code: "no_permission" }, 403);
}

// Like authorizeClient, but for agency-level actions: the caller must be an owner, or an admin holding `permission`.
export async function authorizeAgencyAdmin(
  req: Request,
  agencyId: unknown,
  permission: AgencyPermission = "clients",
): Promise<{ userId: string; supabase: SupabaseClient } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !data?.claims) return json({ error: "Unauthorized" }, 401);
  if (typeof agencyId !== "string" || !agencyId) return json({ error: "agencyId is required" }, 400);

  const supabase = serviceClient();
  const userId = data.claims.sub as string;
  const { data: allowed } = await supabase.rpc("has_agency_permission", {
    _user_id: userId,
    _agency_id: agencyId,
    _perm: permission,
  });
  if (!allowed) return json({ error: "You don't have permission to do this", code: "no_permission" }, 403);
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
