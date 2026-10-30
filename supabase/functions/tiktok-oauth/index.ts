import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeClient, limitError } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Support action via query param (legacy) OR JSON body (preferred for function invoke)
    let action = url.searchParams.get('action');
    let parsedBody: any = null;
    if (!action && req.method !== 'GET') {
      try {
        parsedBody = await req.json();
        action = parsedBody?.action;
      } catch {
        // ignore body parse errors
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const tiktokAppId = Deno.env.get('TIKTOK_APP_ID');
    const tiktokAppSecret = Deno.env.get('TIKTOK_APP_SECRET');

    if (!tiktokAppId || !tiktokAppSecret) {
      console.error('TikTok credentials not configured');
      return new Response(
        JSON.stringify({ error: 'TikTok integration not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send a test Contact event via Events API 2.0 (requires signed-in user with client access)
    if (action === 'test-event') {
      const { clientId, testEventCode } = parsedBody ?? {};
      if (typeof clientId !== 'string' || !clientId) {
        return new Response(JSON.stringify({ error: 'Client ID is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const authHeader = req.headers.get('Authorization') ?? '';
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data: visible } = await userClient.from('clients').select('id').eq('id', clientId).maybeSingle();
      if (!visible) {
        return new Response(JSON.stringify({ error: 'Not allowed for this client' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: account } = await admin.from('tiktok_accounts').select('access_token').eq('client_id', clientId).limit(1).maybeSingle();
      const { data: pixel } = await admin.from('tiktok_pixels').select('pixel_code').eq('client_id', clientId).limit(1).maybeSingle();
      if (!account || !pixel) {
        return new Response(JSON.stringify({ error: !account ? 'No TikTok account connected' : 'No Pixel ID saved in Settings' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const body: Record<string, unknown> = {
        event_source: 'web',
        event_source_id: pixel.pixel_code,
        data: [{
          event: 'Contact',
          event_time: Math.floor(Date.now() / 1000),
          event_id: `test_${crypto.randomUUID()}`,
          page: { url: 'https://wa.me/' },
          properties: { description: 'WhatsConnect test event' },
        }],
      };
      if (typeof testEventCode === 'string' && testEventCode.trim()) body.test_event_code = testEventCode.trim();
      const resp = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: { 'Access-Token': account.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      console.log('TikTok test event result:', result?.code, result?.message);
      return new Response(JSON.stringify({ accepted: result?.code === 0, code: result?.code, message: result?.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate OAuth URL for TikTok login
    if (action === 'get-auth-url') {
      const { redirectUri, state } = parsedBody ?? (await req.json());
      // APP_ORIGINS: comma-separated site origins, e.g. https://wob.vercel.app,https://app.wob.com
      const appOrigins = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
      const allowed = [
        'https://message-tracker-pro.lovable.app/tiktok/callback',
        ...appOrigins.map((o) => `${o}/tiktok/callback`),
      ];
      const isPreview = typeof redirectUri === 'string' && /^https:\/\/[a-z0-9-]+\.lovable\.app\/tiktok\/callback$/.test(redirectUri);
      if (!allowed.includes(redirectUri) && !isPreview) {
        return new Response(JSON.stringify({ error: 'Redirect URI not allowed' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const authUrl = new URL('https://business-api.tiktok.com/portal/auth');
      authUrl.searchParams.set('app_id', tiktokAppId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('state', state);
      
      console.log('Generated TikTok auth URL');
      
      return new Response(
        JSON.stringify({ authUrl: authUrl.toString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle OAuth callback - exchange code for tokens
    if (action === 'callback') {
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
        return new Response(
          JSON.stringify({ error: 'Failed to exchange authorization code', details: tokenData }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
        listUrl.searchParams.set('app_id', tiktokAppId!);
        listUrl.searchParams.set('secret', tiktokAppSecret!);
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
        return new Response(
          JSON.stringify({ error: 'TikTok did not share any ad accounts. Log in with the TikTok account that owns or has admin access to your Ads Manager account, then try again.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, agency_id')
        .eq('id', clientId)
        .single();

      if (clientError || !client) {
        return new Response(
          JSON.stringify({ error: 'Client not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
        return new Response(
          JSON.stringify({ error: 'Could not save your TikTok ad account. Please try again.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: `Connected ${saved} advertiser account(s)`, advertiserCount: saved }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch campaigns for a client with real spend data
    if (action === 'fetch-campaigns') {
      const { clientId, dateFrom, dateTo } = parsedBody ?? (await req.json());
      const auth = await authorizeClient(req, clientId);
      if (auth instanceof Response) return auth;

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Get client info
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, agency_id')
        .eq('id', clientId)
        .single();
      
      if (clientError || !client) {
        return new Response(
          JSON.stringify({ error: 'Client not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Get TikTok accounts for this client
      const { data: accounts, error: accountsError } = await supabase
        .from('tiktok_accounts')
        .select('*')
        .eq('client_id', clientId);
      
      if (accountsError || !accounts?.length) {
        return new Response(
          JSON.stringify({ error: 'No TikTok accounts connected for this client' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Default date range: last 30 days
      const endDate = dateTo || new Date().toISOString().split('T')[0];
      const startDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const allCampaigns = [];

      for (const account of accounts) {
        // First fetch campaign list
        const campaignsResponse = await fetch(
          `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${account.advertiser_id}&page_size=100`,
          {
            headers: {
              'Access-Token': account.access_token,
            },
          }
        );

        const campaignsData = await campaignsResponse.json();
        
        if (campaignsData.code !== 0 || !campaignsData.data?.list) {
          console.error('Failed to fetch campaigns:', campaignsData);
          continue;
        }

        const campaignIds = campaignsData.data.list.map((c: any) => c.campaign_id);
        
        if (campaignIds.length === 0) continue;

        // Fetch spend data from TikTok reporting API
        const reportResponse = await fetch(
          'https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Access-Token': account.access_token,
            },
            body: JSON.stringify({
              advertiser_id: account.advertiser_id,
              report_type: 'BASIC',
              dimensions: ['campaign_id'],
              data_level: 'AUCTION_CAMPAIGN',
              metrics: ['spend', 'clicks', 'impressions', 'reach', 'conversion'],
              start_date: startDate,
              end_date: endDate,
              page_size: 200,
              filtering: {
                campaign_ids: campaignIds,
              },
            }),
          }
        );

        const reportData = await reportResponse.json();
        
        // Build a map of campaign_id -> spend data
        const spendMap = new Map<string, { spend: number; clicks: number; conversions: number }>();
        
        if (reportData.code === 0 && reportData.data?.list) {
          for (const row of reportData.data.list) {
            const metrics = row.metrics;
            spendMap.set(row.dimensions.campaign_id, {
              spend: parseFloat(metrics.spend) || 0,
              clicks: parseInt(metrics.clicks) || 0,
              conversions: parseInt(metrics.conversion) || 0,
            });
          }
        }
        
        // Upsert campaigns with spend data
        for (const campaign of campaignsData.data.list) {
          const spendInfo = spendMap.get(campaign.campaign_id) || { spend: 0, clicks: 0, conversions: 0 };
          
          await supabase.from('tiktok_campaigns').upsert({
            client_id: clientId,
            tenant_id: client.agency_id,
            tiktok_account_id: account.id,
            campaign_id: campaign.campaign_id,
            campaign_name: campaign.campaign_name,
            spend: spendInfo.spend,
            // Note: real_conversations and trash_conversations come from WhatsApp webhook
          }, {
            onConflict: 'tenant_id,campaign_id',
          });
          
          allCampaigns.push({
            id: campaign.campaign_id,
            name: campaign.campaign_name,
            status: campaign.status,
            spend: spendInfo.spend,
          });
        }
      }

      console.log(`Fetched ${allCampaigns.length} campaigns with spend data for client ${clientId}`);

      return new Response(
        JSON.stringify({ campaigns: allCampaigns }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: unknown) {
    console.error('Error in tiktok-oauth function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
