import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeAgencyAdmin } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";
import { loadAllBcs, saveBcAccounts } from "../_shared/bcAccounts.ts";
import { buildAccountList, hashToken, joinUrl, newInviteToken } from "../_shared/agencyLinks.ts";

// Agency owners/admins: list the ad accounts under their Business Centers, invite each owner by link, end links.
// Body: { action, agencyId, ... }. Invite tokens are returned once and only their hash is stored.
Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      const body = await req.json().catch(() => ({}));
      const auth = await authorizeAgencyAdmin(req, body.agencyId, "ad_accounts");
      if (auth instanceof Response) return auth;
      const { supabase, userId } = auth;
      const agencyId: string = body.agencyId;

      if (body.action === "list") {
        const [accts, invs, lnks, conn] = await Promise.all([
          supabase
            .from("bc_accounts")
            .select("advertiser_id, advertiser_name, bc_id, bc_name")
            .eq("agency_id", agencyId)
            .order("advertiser_name")
            .limit(5000),
          supabase
            .from("ad_account_invites")
            .select("id, advertiser_id, created_at, expires_at")
            .eq("agency_id", agencyId)
            .is("accepted_at", null)
            .is("revoked_at", null),
          supabase
            .from("agency_client_links")
            .select("id, advertiser_id, status, linked_at")
            .eq("agency_id", agencyId)
            .order("linked_at", { ascending: false }),
          supabase.from("bc_connections").select("agency_id").eq("agency_id", agencyId).maybeSingle(),
        ]);
        if (accts.error || invs.error || lnks.error) throw accts.error ?? invs.error ?? lnks.error;
        const list = buildAccountList(accts.data ?? [], invs.data ?? [], lnks.data ?? []);
        return json({ needsRefresh: !accts.data?.length && !!conn.data, ...list });
      }

      if (body.action === "refresh") {
        const { data: conn } = await supabase
          .from("bc_connections")
          .select("access_token")
          .eq("agency_id", agencyId)
          .maybeSingle();
        if (!conn) return json({ error: "Connect your TikTok Business Center first", code: "not_connected" }, 400);
        const all = await loadAllBcs(conn.access_token);
        if (all.error) return json({ error: all.error, code: "tiktok_error" }, 502);
        return json({ accounts: await saveBcAccounts(supabase, agencyId, all.bcs) });
      }

      if (body.action === "invite") {
        const ids: unknown = body.advertiserIds;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || !ids.every((i) => typeof i === "string" && i))
          return json({ error: "Pick between 1 and 50 ad accounts" }, 400);
        const advertiserIds = [...new Set(ids as string[])];
        const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
        const [accts, joined] = await Promise.all([
          supabase
            .from("bc_accounts")
            .select("advertiser_id, advertiser_name")
            .eq("agency_id", agencyId)
            .in("advertiser_id", advertiserIds),
          supabase
            .from("agency_client_links")
            .select("advertiser_id")
            .eq("agency_id", agencyId)
            .eq("status", "active")
            .in("advertiser_id", advertiserIds),
        ]);
        const known = new Map<string, string | null>(
          (accts.data ?? []).map((a: { advertiser_id: string; advertiser_name: string | null }) => [
            a.advertiser_id,
            a.advertiser_name,
          ]),
        );
        if (advertiserIds.some((i) => !known.has(i)))
          return json({ error: "Some of those ad accounts are not in your Business Centers. Refresh the list." }, 400);
        if (joined.data?.length) return json({ error: "Some of those ad accounts have already joined" }, 400);

        const links: { advertiserId: string; name: string; url: string }[] = [];
        for (const advertiserId of advertiserIds) {
          const token = newInviteToken();
          const url = joinUrl(Deno.env.get("APP_ORIGINS"), token);
          if (!url) return json({ error: "APP_ORIGINS is not configured" }, 500);
          // One open invite per account: retire the old one first.
          await supabase
            .from("ad_account_invites")
            .update({ revoked_at: new Date().toISOString() })
            .eq("agency_id", agencyId)
            .eq("advertiser_id", advertiserId)
            .is("accepted_at", null)
            .is("revoked_at", null);
          const name = known.get(advertiserId) ?? null;
          const { error } = await supabase.from("ad_account_invites").insert({
            agency_id: agencyId,
            advertiser_id: advertiserId,
            advertiser_name: name,
            token_hash: await hashToken(token),
            note,
            created_by: userId,
          });
          if (error) throw error;
          links.push({ advertiserId, name: name ?? advertiserId, url });
        }
        return json({ links });
      }

      if (body.action === "revoke-invite") {
        const { data } = await supabase
          .from("ad_account_invites")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", String(body.inviteId ?? ""))
          .eq("agency_id", agencyId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .select("id");
        if (!data?.length) return json({ error: "That invite is no longer open" }, 404);
        return json({ success: true });
      }

      if (body.action === "unlink") {
        const linkId = String(body.linkId ?? "");
        const { data: link } = await supabase
          .from("agency_client_links")
          .select("id")
          .eq("id", linkId)
          .eq("agency_id", agencyId)
          .maybeSingle();
        if (!link) return json({ error: "Link not found" }, 404);
        const { error } = await supabase.rpc("end_agency_link", { p_link: linkId, p_by: "agency" });
        if (error?.message?.includes("not_active")) return json({ error: "This link has already ended" }, 409);
        if (error) throw error;
        return json({ success: true });
      }

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      console.error("agency-links error", e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }),
);
