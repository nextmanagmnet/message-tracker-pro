import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const action = url.searchParams.get('action');

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

    // Generate OAuth URL for TikTok login
    if (action === 'get-auth-url') {
      const { redirectUri, state } = await req.json();
      
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
      const { code, tenantId, userId } = await req.json();
      
      console.log('Exchanging TikTok auth code for tokens');
      
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

      const { access_token, advertiser_ids } = tokenData.data;
      
      // Store each advertiser account
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const insertPromises = advertiser_ids.map(async (advertiserId: string) => {
        // Get advertiser info
        const infoResponse = await fetch(`https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${advertiserId}"]`, {
          headers: {
            'Access-Token': access_token,
          },
        });
        
        const infoData = await infoResponse.json();
        const advertiserName = infoData.data?.list?.[0]?.name || 'Unknown';
        
        return supabase.from('tiktok_accounts').upsert({
          tenant_id: tenantId,
          advertiser_id: advertiserId,
          advertiser_name: advertiserName,
          access_token: access_token,
        }, {
          onConflict: 'tenant_id,advertiser_id',
        });
      });

      await Promise.all(insertPromises);
      
      console.log(`Connected ${advertiser_ids.length} TikTok advertiser accounts`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Connected ${advertiser_ids.length} advertiser account(s)`,
          advertiserCount: advertiser_ids.length 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch campaigns for a tenant
    if (action === 'fetch-campaigns') {
      const { tenantId } = await req.json();
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Get TikTok accounts for this tenant
      const { data: accounts, error: accountsError } = await supabase
        .from('tiktok_accounts')
        .select('*')
        .eq('tenant_id', tenantId);
      
      if (accountsError || !accounts?.length) {
        return new Response(
          JSON.stringify({ error: 'No TikTok accounts connected' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const allCampaigns = [];

      for (const account of accounts) {
        const campaignsResponse = await fetch(
          `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${account.advertiser_id}&page_size=100`,
          {
            headers: {
              'Access-Token': account.access_token,
            },
          }
        );

        const campaignsData = await campaignsResponse.json();
        
        if (campaignsData.code === 0 && campaignsData.data?.list) {
          for (const campaign of campaignsData.data.list) {
            // Upsert campaign data
            await supabase.from('tiktok_campaigns').upsert({
              tenant_id: tenantId,
              tiktok_account_id: account.id,
              campaign_id: campaign.campaign_id,
              campaign_name: campaign.campaign_name,
            }, {
              onConflict: 'tenant_id,campaign_id',
            });
            
            allCampaigns.push({
              id: campaign.campaign_id,
              name: campaign.campaign_name,
              status: campaign.status,
            });
          }
        }
      }

      console.log(`Fetched ${allCampaigns.length} campaigns for tenant ${tenantId}`);

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
