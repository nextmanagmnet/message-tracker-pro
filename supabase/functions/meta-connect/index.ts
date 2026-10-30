import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeClient, limitError } from "../_shared/auth.ts";
import { buildMetaPayload } from "../_shared/funnel.ts";
import { metaActionSource, postMetaEvents } from "../_shared/conversions.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphGet(path: string, token: string) {
  const r = await fetch(`${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error(d?.error?.message || `Meta error (${r.status})`);
  return d;
}

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

// Meta pixel + pasted tokens for a client. Tokens are write-only: nothing here returns them.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { action, clientId } = body;
    const auth = await authorizeClient(req, clientId);
    if (auth instanceof Response) return auth;
    const { supabase } = auth;

    const row = async () =>
      (await supabase.from("meta_accounts")
        .select("id, dataset_id, dataset_name, ad_account_id, ad_account_name, capi_token, ads_token")
        .eq("client_id", clientId).maybeSingle()).data;
    const tenant = async () =>
      (await supabase.from("clients").select("agency_id").eq("id", clientId).single()).data?.agency_id ?? null;
    const saved = (error: { message: string } | null) =>
      error ? (limitError(error) ?? json({ error: error.message }, 400)) : json({ success: true });

    switch (action) {
      case "status": {
        const r = await row();
        return json({
          connected: Boolean(r?.dataset_id && r?.capi_token),
          pixelId: r?.dataset_id ?? null,
          pixelName: r?.dataset_name ?? null,
          hasCapiToken: Boolean(r?.capi_token),
          adAccountId: r?.ad_account_id ?? null,
          adAccountName: r?.ad_account_name ?? null,
          hasAdsToken: Boolean(r?.ads_token),
        });
      }

      case "save-pixel": {
        const pixelId = String(body.pixelId ?? "").trim();
        const token = String(body.capiToken ?? "").trim();
        if (!/^\d{5,20}$/.test(pixelId)) return json({ error: "The pixel ID should be digits only." }, 400);
        if (token.length < 20) return json({ error: "Paste the full Conversions API access token." }, 400);
        let name: string | null;
        try {
          name = (await graphGet(`/${pixelId}?fields=name`, token)).name ?? null;
        } catch (e) {
          return json({ error: `Meta couldn't verify this pixel and token: ${e instanceof Error ? e.message : "unknown error"}` }, 400);
        }
        const { error } = await supabase.from("meta_accounts").upsert(
          { client_id: clientId, tenant_id: await tenant(), dataset_id: pixelId, dataset_name: name, capi_token: token },
          { onConflict: "client_id" },
        );
        return saved(error);
      }

      case "save-ads": {
        const adAccountId = String(body.adAccountId ?? "").trim().replace(/^act_/i, "");
        const token = String(body.adsToken ?? "").trim();
        if (!/^\d{5,20}$/.test(adAccountId)) return json({ error: "The ad account ID should be digits only." }, 400);
        if (token.length < 20) return json({ error: "Paste the full read-only access token." }, 400);
        let name: string | null;
        try {
          name = (await graphGet(`/act_${adAccountId}?fields=name,currency`, token)).name ?? null;
        } catch (e) {
          return json({ error: `Meta couldn't read this ad account with that token: ${e instanceof Error ? e.message : "unknown error"}` }, 400);
        }
        const { error } = await supabase.from("meta_accounts").upsert(
          { client_id: clientId, tenant_id: await tenant(), ad_account_id: adAccountId, ad_account_name: name, ads_token: token },
          { onConflict: "client_id" },
        );
        return saved(error);
      }

      case "test-event": {
        const r = await row();
        if (!r?.dataset_id || !r?.capi_token) return json({ error: "Save your pixel and token first." }, 400);
        const payload = {
          ...buildMetaPayload({
            eventName: "Contact",
            eventId: `test_${crypto.randomUUID()}`,
            eventTime: Math.floor(Date.now() / 1000),
            phoneHash: await sha256("0"),
            actionSource: metaActionSource(),
          }),
          ...(typeof body.testEventCode === "string" && body.testEventCode.trim()
            ? { test_event_code: body.testEventCode.trim() }
            : {}),
        };
        const { ok, result } = await postMetaEvents(r.dataset_id, r.capi_token, payload);
        return json({ accepted: ok, message: result?.error?.message ?? null });
      }

      case "disconnect": {
        const { error } = body.part === "ads"
          ? await supabase.from("meta_accounts").update({ ads_token: null, ad_account_id: null, ad_account_name: null }).eq("client_id", clientId)
          : await supabase.from("meta_accounts").delete().eq("client_id", clientId);
        return saved(error);
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("meta-connect error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
