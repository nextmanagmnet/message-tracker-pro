import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeClient, serviceClient } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";
import { ensurePixel } from "../_shared/tiktokPixel.ts";
import { hashToken, INVITE_INVALID, isTokenShape, mapJoinError } from "../_shared/agencyLinks.ts";

// The ad-account owner's side of an agency invite: preview (no login), accept, leave.
const invalid = () => json({ error: INVITE_INVALID.error, code: INVITE_INVALID.code }, INVITE_INVALID.status);

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));

      if (body.action === "preview") {
        // Same answer for unknown, expired, used and revoked tokens.
        if (!isTokenShape(body.token)) return json({ valid: false });
        const db = serviceClient();
        const { data: inv } = await db
          .from("ad_account_invites")
          .select("agency_id, advertiser_name")
          .eq("token_hash", await hashToken(body.token))
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (!inv) return json({ valid: false });
        const { data: agency } = await db.from("agencies").select("name").eq("id", inv.agency_id).maybeSingle();
        return json({ valid: true, agencyName: agency?.name ?? "", advertiserName: inv.advertiser_name ?? "" });
      }

      const auth = await authorizeClient(req, body.clientId);
      if (auth instanceof Response) return auth;
      const { supabase, userId } = auth;
      const clientId: string = body.clientId;

      // Linking or leaving changes the workspace's ad account: owners and admins of the workspace only.
      const { data: client } = await supabase.from("clients").select("agency_id").eq("id", clientId).maybeSingle();
      const [owner, admin] = await Promise.all(
        ["owner", "admin"].map((role) =>
          supabase.rpc("has_agency_role", { _user_id: userId, _agency_id: client?.agency_id, _role: role }),
        ),
      );
      if (!client || (!owner.data && !admin.data))
        return json({ error: "Only workspace owners and admins can do this" }, 403);

      if (body.action === "accept") {
        if (!isTokenShape(body.token)) return invalid();
        const hash = await hashToken(body.token);
        const { data: inv } = await supabase
          .from("ad_account_invites")
          .select("agency_id, advertiser_name")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!inv) return invalid();
        const [{ data: conn }, { data: agency }] = await Promise.all([
          supabase.from("bc_connections").select("access_token").eq("agency_id", inv.agency_id).maybeSingle(),
          supabase.from("agencies").select("name").eq("id", inv.agency_id).maybeSingle(),
        ]);
        if (!conn?.access_token) return invalid();
        const { error } = await supabase.rpc("accept_agency_invite", {
          p_hash: hash,
          p_client: clientId,
          p_user: userId,
          p_agency_token: conn.access_token,
        });
        if (error) {
          const mapped = mapJoinError(error);
          if (mapped) return json({ error: mapped.error, code: mapped.code }, mapped.status);
          throw error;
        }
        await ensurePixel(supabase, clientId).catch((e) => console.error("agency-join pixel", e));
        return json({ success: true, agencyName: agency?.name ?? "", advertiserName: inv.advertiser_name ?? "" });
      }

      if (body.action === "leave") {
        const linkId = String(body.linkId ?? "");
        const { data: link } = await supabase
          .from("agency_client_links")
          .select("client_id")
          .eq("id", linkId)
          .maybeSingle();
        if (!link || link.client_id !== clientId) return json({ error: "Link not found" }, 404);
        const { error } = await supabase.rpc("end_agency_link", { p_link: linkId, p_by: "user" });
        if (error?.message?.includes("not_active")) return json({ error: "This link has already ended" }, 409);
        if (error) throw error;
        return json({ success: true });
      }

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      console.error("agency-join error", e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }),
);
