import { createHash } from "node:crypto";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAgencyAdmin, authorizeClient, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, isAuthorizedCron, json, logJob } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { tiktokApi, TikTokApiError } from "../_shared/tiktokApi.ts";
import {
  type AudienceSource,
  isLookalikeSize,
  isSource,
  MIN_AUDIENCE_SIZE,
  membersFile,
  needsReconnect,
  SOURCE_STAGES,
  uploadAudienceFile,
} from "../_shared/audiences.ts";

// TikTok Customer File audiences from a client's buyers / qualified leads, plus optional lookalikes.
// App: { action: list | create | refresh | lookalike | delete, clientId, ... } — list for any member,
// everything else for agency owners/admins. Scheduler (x-cron-secret): re-uploads every ready audience.

const RECONNECT = "RECONNECT_TIKTOK"; // the page shows its "reconnect TikTok" state for this message
const COLUMNS =
  "id, client_id, name, source, tiktok_audience_id, tiktok_lookalike_id, member_count, status, error, last_synced_at, created_at";

type Account = { advertiser_id: string; access_token: string };
type Audience = {
  id: string;
  client_id: string;
  name: string;
  source: AudienceSource;
  tiktok_audience_id: string | null;
  tiktok_lookalike_id: string | null;
  member_count: number | null;
  status: string;
};
type MemberRow = { conversation_contacts: { contact_jid: string } | null };

async function accountFor(supabase: SupabaseClient, clientId: string): Promise<Account | null> {
  const { data } = await supabase
    .from("tiktok_accounts")
    .select("advertiser_id, access_token")
    .eq("client_id", clientId)
    .maybeSingle();
  return data as Account | null;
}

// WhatsApp numbers of the client's leads at the source's stages, as TikTok's PHONE_SHA256 file.
async function members(supabase: SupabaseClient, clientId: string, source: AudienceSource) {
  const jids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("conversations")
      .select("conversation_contacts(contact_jid), leads!inner(stage)")
      .eq("client_id", clientId)
      .in("leads.stage", SOURCE_STAGES[source])
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as MemberRow[];
    for (const r of rows) if (r.conversation_contacts) jids.push(r.conversation_contacts.contact_jid);
    if (rows.length < 1000) break;
  }
  return await membersFile(jids);
}

// Uploads the current members and either creates the TikTok audience or replaces its contents.
async function sync(supabase: SupabaseClient, account: Account, row: Audience) {
  await supabase.from("tiktok_audiences").update({ status: "syncing", error: null }).eq("id", row.id);
  try {
    const { csv, count } = await members(supabase, row.client_id, row.source);
    if (count === 0) throw new Error("No members with a WhatsApp number yet");
    const filePath = await uploadAudienceFile(
      account.access_token,
      account.advertiser_id,
      csv,
      createHash("md5").update(csv).digest("hex"),
    );
    let audienceId = row.tiktok_audience_id;
    if (audienceId) {
      await tiktokApi("dmp/custom_audience/update/", account.access_token, {
        body: {
          advertiser_id: account.advertiser_id,
          custom_audience_id: audienceId,
          action: "REPLACE",
          file_paths: [filePath],
        },
      });
    } else {
      const d = await tiktokApi<{ custom_audience_id?: string }>("dmp/custom_audience/create/", account.access_token, {
        body: {
          advertiser_id: account.advertiser_id,
          custom_audience_name: row.name,
          file_paths: [filePath],
          calculate_type: "PHONE_SHA256",
        },
      });
      audienceId = d.custom_audience_id ? String(d.custom_audience_id) : null;
      if (!audienceId) throw new Error("TikTok did not return an audience id");
    }
    const patch = {
      tiktok_audience_id: audienceId,
      member_count: count,
      status: "ready",
      error: null,
      last_synced_at: new Date().toISOString(),
    };
    await supabase.from("tiktok_audiences").update(patch).eq("id", row.id);
    return { ...row, ...patch };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("tiktok_audiences").update({ status: "failed", error: message }).eq("id", row.id);
    throw e;
  }
}

function fail(e: unknown) {
  if (e instanceof TikTokApiError && needsReconnect(e.code, e.message)) return json({ error: RECONNECT }, 400);
  return json({ error: e instanceof Error ? e.message : String(e) }, 400);
}

async function cronRefresh(supabase: SupabaseClient) {
  // "failed" too: last week's hiccup (e.g. an expired token since reconnected) shouldn't stop the refresh for good.
  const { data } = await supabase
    .from("tiktok_audiences")
    .select(COLUMNS)
    .in("status", ["ready", "failed"])
    .not("tiktok_audience_id", "is", null);
  const rows = (data ?? []) as Audience[];
  const accounts = new Map<string, Account | null>();
  let refreshed = 0;
  const failures: Record<string, string> = {};
  for (const row of rows) {
    if (!accounts.has(row.client_id)) accounts.set(row.client_id, await accountFor(supabase, row.client_id));
    const account = accounts.get(row.client_id);
    if (!account) continue;
    try {
      await sync(supabase, account, row);
      refreshed++;
    } catch (e) {
      failures[row.id] = e instanceof Error ? e.message : String(e);
    }
  }
  await logJob(supabase, "tiktok-audiences", {
    status: Object.keys(failures).length ? "partial" : "success",
    details: { refreshed, failures },
  });
  return json({ refreshed, failures });
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (req.headers.has("x-cron-secret")) {
      const supabase = serviceClient();
      if (!(await isAuthorizedCron(req, supabase))) return json({ error: "Unauthorized" }, 401);
      return await cronRefresh(supabase);
    }

    const body = await req.json().catch(() => ({}));
    const { action, clientId } = body;

    if (action === "list") {
      const auth = await authorizeClient(req, clientId);
      if (auth instanceof Response) return auth;
      const { supabase } = auth;
      const count = async (stages: string[]) =>
        (
          await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .in("stage", stages)
        ).count ?? 0;
      const [{ data }, account, buyers, qualified] = await Promise.all([
        supabase.from("tiktok_audiences").select(COLUMNS).eq("client_id", clientId).order("created_at"),
        accountFor(supabase, clientId),
        count(SOURCE_STAGES.buyers),
        count(SOURCE_STAGES.qualified),
      ]);
      return json({
        audiences: data ?? [],
        connected: !!account,
        counts: { buyers, qualified },
        minSize: MIN_AUDIENCE_SIZE,
      });
    }

    // Everything else changes TikTok: agency owners/admins of the client's agency only.
    if (typeof clientId !== "string" || !clientId) return json({ error: "clientId is required" }, 400);
    const { data: client } = await serviceClient().from("clients").select("agency_id").eq("id", clientId).maybeSingle();
    const auth = await authorizeAgencyAdmin(req, client?.agency_id);
    if (auth instanceof Response) return auth;
    const { supabase } = auth;
    const account = await accountFor(supabase, clientId);
    if (!account) return json({ error: RECONNECT }, 400);

    if (action === "create") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (!name) return json({ error: "name is required" }, 400);
      if (!isSource(body.source)) return json({ error: "source must be buyers or qualified" }, 400);
      const { data: row, error } = await supabase
        .from("tiktok_audiences")
        .insert({ client_id: clientId, name, source: body.source, status: "pending" })
        .select(COLUMNS)
        .single();
      if (error) return json({ error: error.message }, 500);
      try {
        return json({ audience: await sync(supabase, account, row as Audience) });
      } catch (e) {
        await supabase
          .from("tiktok_audiences")
          .delete()
          .eq("id", (row as Audience).id); // nothing made on TikTok
        return fail(e);
      }
    }

    const { data: found } = await supabase
      .from("tiktok_audiences")
      .select(COLUMNS)
      .eq("id", body.id ?? "")
      .eq("client_id", clientId)
      .maybeSingle();
    const row = found as Audience | null;
    if (!row) return json({ error: "Audience not found" }, 404);

    if (action === "refresh") {
      try {
        return json({ audience: await sync(supabase, account, row) });
      } catch (e) {
        return fail(e);
      }
    }

    if (action === "lookalike") {
      if (!row.tiktok_audience_id || row.tiktok_lookalike_id) return json({ error: "Nothing to do" }, 400);
      if (!isLookalikeSize(body.size)) return json({ error: "size must be NARROW, BALANCED or BROAD" }, 400);
      try {
        // Lookalikes are built in the ad account's own country (advertiser/info returns it as e.g. "SA").
        const info = await tiktokApi<{ list?: { country?: string }[] }>("advertiser/info/", account.access_token, {
          params: { advertiser_ids: JSON.stringify([account.advertiser_id]), fields: JSON.stringify(["country"]) },
        });
        const country = info.list?.[0]?.country;
        if (!country) return json({ error: "TikTok did not return the ad account's country" }, 400);
        const d = await tiktokApi<{ custom_audience_id?: string }>(
          "dmp/custom_audience/lookalike/create/",
          account.access_token,
          {
            body: {
              advertiser_id: account.advertiser_id,
              custom_audience_name: `${row.name} (lookalike)`,
              lookalike_spec: {
                source_audience_id: row.tiktok_audience_id,
                location_ids: [country],
                audience_size: body.size,
                placements: ["TikTok"],
                mobile_os: "ALL",
                include_source: false,
              },
            },
          },
        );
        const lookalikeId = d.custom_audience_id ? String(d.custom_audience_id) : null;
        await supabase.from("tiktok_audiences").update({ tiktok_lookalike_id: lookalikeId }).eq("id", row.id);
        return json({ lookalikeId });
      } catch (e) {
        return fail(e); // e.g. "Seed audience size needs to be at lease 1000" — shown as-is
      }
    }

    if (action === "delete") {
      const ids = [row.tiktok_lookalike_id, row.tiktok_audience_id].filter((v): v is string => !!v);
      if (ids.length) {
        try {
          await tiktokApi("dmp/custom_audience/delete/", account.access_token, {
            body: { advertiser_id: account.advertiser_id, custom_audience_ids: ids },
          });
        } catch (e) {
          // A token problem must not orphan the audience on TikTok; anything else (already gone) still removes the row.
          if (e instanceof TikTokApiError && needsReconnect(e.code, e.message)) return fail(e);
          console.error("TikTok audience delete failed", e instanceof Error ? e.message : e);
        }
      }
      await supabase.from("tiktok_audiences").delete().eq("id", row.id);
      return json({ deleted: true });
    }

    return json({ error: "Unknown action" }, 400);
  }),
);
