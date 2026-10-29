import { corsHeaders, json } from "../_shared/cron.ts";
import { authorizeClient, limitError } from "../_shared/auth.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
const SCOPES = "ads_read,ads_management,business_management";

async function graph(path: string, token?: string) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${GRAPH}${path}${token ? `${sep}access_token=${encodeURIComponent(token)}` : ""}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error(d?.error?.message || `Meta error (${r.status})`);
  return d;
}

// Meta ad account connection for a client. The access token never leaves the server.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { action, clientId } = body;
    const auth = await authorizeClient(req, clientId);
    if (auth instanceof Response) return auth;
    const { supabase } = auth;

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) return json({ error: "Meta integration is not configured" }, 500);

    const activeAccount = async () =>
      (await supabase.from("meta_accounts").select("id, ad_account_id, ad_account_name, dataset_id, dataset_name, access_token")
        .eq("client_id", clientId).neq("ad_account_id", "pending").limit(1).maybeSingle()).data;

    switch (action) {
      case "get-auth-url": {
        const { redirectUri, state } = body;
        if (typeof redirectUri !== "string" || typeof state !== "string") return json({ error: "redirectUri and state are required" }, 400);
        // Meta only accepts redirect URIs registered on the app, so this can't become an open redirect.
        const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
        u.searchParams.set("client_id", appId);
        u.searchParams.set("redirect_uri", redirectUri);
        u.searchParams.set("state", state);
        u.searchParams.set("scope", SCOPES);
        u.searchParams.set("response_type", "code");
        return json({ authUrl: u.toString() });
      }

      case "callback": {
        const { code, redirectUri } = body;
        if (typeof code !== "string" || typeof redirectUri !== "string") return json({ error: "code and redirectUri are required" }, 400);
        const short = await graph(
          `/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
        );
        const long = await graph(
          `/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(short.access_token)}`,
        );
        const token = long.access_token as string;
        const expiresAt = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000).toISOString() : null;
        const accounts = await graph(`/me/adaccounts?fields=id,name&limit=200`, token);

        const { data: client } = await supabase.from("clients").select("agency_id").eq("id", clientId).single();
        // Park the token on a placeholder row until the user picks an ad account.
        const { error } = await supabase.from("meta_accounts").upsert({
          client_id: clientId,
          tenant_id: client?.agency_id,
          ad_account_id: "pending",
          ad_account_name: null,
          access_token: token,
          token_expires_at: expiresAt,
        }, { onConflict: "client_id,ad_account_id" });
        if (error) return limitError(error) ?? json({ error: error.message }, 400);

        return json({ adAccounts: (accounts.data ?? []).map((a: any) => ({ id: a.id, name: a.name })) });
      }

      case "select-account": {
        const { adAccountId, adAccountName } = body;
        if (typeof adAccountId !== "string" || !/^act_\d+$/.test(adAccountId)) return json({ error: "Invalid ad account" }, 400);
        const { data: pending } = await supabase.from("meta_accounts").select("id, access_token, token_expires_at")
          .eq("client_id", clientId).eq("ad_account_id", "pending").maybeSingle();
        if (!pending) return json({ error: "Connect Meta again, the login expired" }, 400);
        // Confirm the token can really see this ad account.
        await graph(`/${adAccountId}?fields=id`, pending.access_token);

        const { data: existing } = await supabase.from("meta_accounts").select("id")
          .eq("client_id", clientId).eq("ad_account_id", adAccountId).maybeSingle();
        const { error } = existing
          ? await supabase.from("meta_accounts").update({
            access_token: pending.access_token, token_expires_at: pending.token_expires_at, ad_account_name: adAccountName ?? null,
          }).eq("id", existing.id)
          : await supabase.from("meta_accounts").update({ ad_account_id: adAccountId, ad_account_name: adAccountName ?? null })
            .eq("id", pending.id);
        if (error) return limitError(error) ?? json({ error: error.message }, 400);
        if (existing) await supabase.from("meta_accounts").delete().eq("id", pending.id);
        return json({ success: true });
      }

      case "list-datasets": {
        const acct = await activeAccount();
        if (!acct) return json({ error: "No Meta ad account connected" }, 400);
        const d = await graph(`/${acct.ad_account_id}/adspixels?fields=id,name&limit=100`, acct.access_token);
        return json({ datasets: (d.data ?? []).map((p: any) => ({ id: p.id, name: p.name })) });
      }

      case "select-dataset": {
        const { datasetId, datasetName } = body;
        if (typeof datasetId !== "string" || !/^\d+$/.test(datasetId)) return json({ error: "Invalid dataset" }, 400);
        const acct = await activeAccount();
        if (!acct) return json({ error: "No Meta ad account connected" }, 400);
        const { error } = await supabase.from("meta_accounts")
          .update({ dataset_id: datasetId, dataset_name: datasetName ?? null }).eq("id", acct.id);
        return error ? json({ error: error.message }, 400) : json({ success: true });
      }

      case "status": {
        const acct = await activeAccount();
        return json({
          connected: Boolean(acct),
          adAccountId: acct?.ad_account_id ?? null,
          adAccountName: acct?.ad_account_name ?? null,
          datasetId: acct?.dataset_id ?? null,
          datasetName: acct?.dataset_name ?? null,
        });
      }

      case "disconnect": {
        const { error } = await supabase.from("meta_accounts").delete().eq("client_id", clientId);
        return error ? json({ error: error.message }, 400) : json({ success: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("meta-oauth error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
