import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

  if (!whatsappToken) {
    return new Response(
      JSON.stringify({ error: "WHATSAPP_ACCESS_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate JWT and get user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const anonClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } =
    await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub as string;

  try {
    const body = await req.json();
    const { action, clientId, wabaId, phoneNumbers } = body;

    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user can access this client
    const { data: canAccess } = await supabase.rpc("user_can_access_client", {
      _user_id: userId,
      _client_id: clientId,
    });
    if (!canAccess) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client's tenant_id
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("agency_id")
      .eq("id", clientId)
      .single();

    if (clientError || !clientData) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant_id from agency
    const { data: agencyData } = await supabase
      .from("agencies")
      .select("id")
      .eq("id", clientData.agency_id)
      .single();

    // For now, we'll use the agency_id as tenant_id since we're in agency model
    // The tenant_id column exists for legacy compatibility
    const tenantId = clientData.agency_id;

    switch (action) {
      case "validate-token": {
        // Validate the WhatsApp token by fetching business info
        const meRes = await fetch(`${GRAPH_BASE}/me?access_token=${whatsappToken}`);
        if (!meRes.ok) {
          const errData = await meRes.json();
          return new Response(
            JSON.stringify({ valid: false, error: errData.error?.message || "Invalid token" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const meData = await meRes.json();
        return new Response(
          JSON.stringify({ valid: true, user: meData }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch-wabas": {
        // Fetch all WABAs the token has access to
        const wabasRes = await fetch(
          `${GRAPH_BASE}/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,account_review_status}&access_token=${whatsappToken}`
        );
        if (!wabasRes.ok) {
          const errData = await wabasRes.json();
          return new Response(
            JSON.stringify({ error: errData.error?.message || "Failed to fetch WABAs" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const wabasData = await wabasRes.json();
        
        // Flatten WABAs from all businesses
        const wabas: Array<{ id: string; name: string; businessId: string; businessName: string; status: string }> = [];
        for (const business of wabasData.data || []) {
          const owned = business.owned_whatsapp_business_accounts?.data || [];
          for (const waba of owned) {
            wabas.push({
              id: waba.id,
              name: waba.name || "Unnamed WABA",
              businessId: business.id,
              businessName: business.name,
              status: waba.account_review_status || "unknown",
            });
          }
        }

        return new Response(
          JSON.stringify({ wabas }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch-phone-numbers": {
        if (!wabaId) {
          return new Response(JSON.stringify({ error: "wabaId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch phone numbers for a WABA
        const phonesRes = await fetch(
          `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type&access_token=${whatsappToken}`
        );
        if (!phonesRes.ok) {
          const errData = await phonesRes.json();
          return new Response(
            JSON.stringify({ error: errData.error?.message || "Failed to fetch phone numbers" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const phonesData = await phonesRes.json();

        const phones = (phonesData.data || []).map((p: any) => ({
          id: p.id,
          phoneNumber: p.display_phone_number,
          verifiedName: p.verified_name,
          qualityRating: p.quality_rating,
          platformType: p.platform_type,
        }));

        return new Response(
          JSON.stringify({ phoneNumbers: phones }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "import-numbers": {
        if (!wabaId || !phoneNumbers || !Array.isArray(phoneNumbers)) {
          return new Response(
            JSON.stringify({ error: "wabaId and phoneNumbers array are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const imported: string[] = [];
        const failed: Array<{ phoneNumberId: string; error: string }> = [];

        for (const phone of phoneNumbers) {
          const { phoneNumberId, displayPhoneNumber } = phone;

          // Check if already exists
          const { data: existing } = await supabase
            .from("whatsapp_numbers")
            .select("id")
            .eq("phone_number_id", phoneNumberId)
            .eq("client_id", clientId)
            .maybeSingle();

          if (existing) {
            // Update status to connected
            await supabase
              .from("whatsapp_numbers")
              .update({ status: "connected" })
              .eq("id", existing.id);
            imported.push(phoneNumberId);
            continue;
          }

          // Insert new
          const { error: insertError } = await supabase
            .from("whatsapp_numbers")
            .insert({
              client_id: clientId,
              tenant_id: tenantId,
              phone_number: displayPhoneNumber,
              phone_number_id: phoneNumberId,
              waba_id: wabaId,
              status: "connected",
            });

          if (insertError) {
            failed.push({ phoneNumberId, error: insertError.message });
          } else {
            imported.push(phoneNumberId);
          }
        }

        return new Response(
          JSON.stringify({ imported, failed }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
