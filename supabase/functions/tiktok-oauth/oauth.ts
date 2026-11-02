import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeClient, limitError } from "../_shared/auth.ts";
import { appOrigins } from "../_shared/cors.ts";
import { json } from "../_shared/cron.ts";
import { ensurePixel } from "../_shared/tiktokPixel.ts";
import type { TikTokContext } from "./types.ts";

// Generate OAuth URL for TikTok login
export async function getAuthUrl({ req, parsedBody, tiktokAppId }: TikTokContext): Promise<Response> {
  const { redirectUri, state } = parsedBody ?? (await req.json());
  const allowed = appOrigins(Deno.env.get('APP_ORIGINS')).map((o) => `${o}/tiktok/callback`);
  if (!allowed.includes(redirectUri)) {
    return json({ error: 'Redirect URI not allowed' }, 400);
  }

  const authUrl = new URL('https://business-api.tiktok.com/portal/auth');
  authUrl.searchParams.set('app_id', tiktokAppId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  console.log('Generated TikTok auth URL');

  return json({ authUrl: authUrl.toString() });
}

// Handle OAuth callback - exchange code for tokens
export async function callback(ctx: TikTokContext): Promise<Response> {
  const { req, parsedBody, tiktokAppId, tiktokAppSecret } = ctx;
  const { code, clientId } = parsedBody ?? (await req.json());
  const auth = await authorizeClient(req, clientId);
  if (auth instanceof Response) return auth;

  console.log('Exchanging TikTok auth code for tokens for client:', clientId);

  // Exchange authorization code for access token
  const tokenResponse = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: tiktokAppId,
      secret: tiktokAppSecret,
      auth_code: code,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.code !== 0) {
    console.error('TikTok token exchange failed:', tokenData);
    return json({ error: 'Failed to exchange authorization code', details: tokenData }, 400);
  }

  const {
    access_token,
    refresh_token,
    access_token_expire_in,
  } = tokenData.data;
  const tokenExpiresAt = access_token_expire_in
    ? new Date(Date.now() + Number(access_token_expire_in) * 1000).toISOString()
    : null;

  // Collect advertisers: token response + authorized ad accounts endpoint
  const advertisers = new Map<string, string>();
  for (const id of (tokenData.data.advertiser_ids ?? []) as unknown[]) advertisers.set(String(id), 'Unknown');
  try {
    const listUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/');
    listUrl.searchParams.set('app_id', tiktokAppId);
    listUrl.searchParams.set('secret', tiktokAppSecret);
    const listResp = await fetch(listUrl, { headers: { 'Access-Token': access_token } });
    const listData = await listResp.json();
    console.log('advertiser/get result:', listData?.code, listData?.message, listData?.data?.list?.length ?? 0);
    for (const a of listData?.data?.list ?? []) {
      advertisers.set(String(a.advertiser_id), a.advertiser_name || 'Unknown');
    }
  } catch (e) {
    console.error('advertiser/get failed:', e);
  }

  if (advertisers.size === 0) {
    return json({ error: 'TikTok did not share any ad accounts. Log in with the TikTok account that owns or has admin access to your Ads Manager account, then try again.' });
  }

  const supabase = createClient(ctx.supabaseUrl, ctx.supabaseServiceKey);
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, agency_id')
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    return json({ error: 'Client not found' }, 404);
  }

  let saved = 0;
  let limitHit: Response | null = null;
  for (const [advertiserId, listedName] of advertisers) {
    let advertiserName = listedName;
    if (advertiserName === 'Unknown') {
      try {
        const infoResponse = await fetch(`https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${advertiserId}"]`, {
          headers: { 'Access-Token': access_token },
        });
        const infoData = await infoResponse.json();
        advertiserName = infoData.data?.list?.[0]?.name || 'Unknown';
      } catch { /* keep Unknown */ }
    }

    const { data: existing } = await supabase
      .from('tiktok_accounts').select('id')
      .eq('client_id', clientId).eq('advertiser_id', advertiserId).maybeSingle();
    const row = {
      client_id: clientId,
      tenant_id: client.agency_id,
      advertiser_id: advertiserId,
      advertiser_name: advertiserName,
      access_token,
      refresh_token: refresh_token ?? null,
      token_expires_at: tokenExpiresAt,
    };
    const { error: saveError } = existing
      ? await supabase.from('tiktok_accounts').update(row).eq('id', existing.id)
      : await supabase.from('tiktok_accounts').insert(row);
    if (saveError) {
      limitHit ??= limitError(saveError);
      console.error('Failed to save advertiser', advertiserId, saveError);
    } else saved++;
  }

  console.log(`Connected ${saved} TikTok advertiser accounts for client ${clientId}`);

  if (saved === 0 && limitHit) return limitHit;
  if (saved === 0) {
    return json({ error: 'Could not save your TikTok ad account. Please try again.' });
  }

  // Tracking setup is best effort: the connection itself already succeeded.
  let pixel: unknown = null;
  try {
    pixel = await ensurePixel(supabase, clientId);
  } catch (e) {
    console.error('ensurePixel after connect failed:', e instanceof Error ? e.message : e);
  }

  return json({ success: true, message: `Connected ${saved} advertiser account(s)`, advertiserCount: saved, pixel });
}
