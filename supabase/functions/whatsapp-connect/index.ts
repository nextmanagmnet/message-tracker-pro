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
  const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";

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

    const greenId = Deno.env.get("GREEN_API_INSTANCE_ID");
    const greenToken = Deno.env.get("GREEN_API_TOKEN");
    const greenBase = Deno.env.get("GREEN_API_URL") ||
      (greenId ? `https://${greenId.slice(0, 4)}.api.greenapi.com` : "");
    const green = async (method: string, init?: RequestInit) => {
      const r = await fetch(`${greenBase}/waInstance${greenId}/${method}/${greenToken}`, init);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`WhatsApp gateway error (${r.status})`);
      return d;
    };
    const ok = (o: unknown) =>
      new Response(JSON.stringify(o), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (action?.startsWith("qr-") && (!greenId || !greenToken)) {
      return ok({ error: "WhatsApp gateway is not configured yet." });
    }

    switch (action) {
      case "qr-start": {
        // Point the gateway's incoming messages at our webhook
        await green("setSettings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            webhookUrl: `${supabaseUrl}/functions/v1/whatsapp-webhook`,
            webhookUrlToken: Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "",
            incomingWebhook: "yes",
            outgoingWebhook: "no",
            outgoingMessageWebhook: "no",
            outgoingAPIMessageWebhook: "no",
            stateWebhook: "yes",
          }),
        }).catch((e) => console.error("setSettings failed", e));
        const state = await green("getStateInstance");
        if (state.stateInstance === "authorized") return ok({ state: "authorized" });
        const qr = await green("qr");
        if (qr.type === "alreadyLogged") return ok({ state: "authorized" });
        if (qr.type !== "qrCode") return ok({ state: state.stateInstance, error: qr.message || "QR not ready, try again" });
        return ok({ state: "qr", qr: qr.message });
      }

      case "qr-status": {
        const state = await green("getStateInstance");
        if (state.stateInstance !== "authorized") {
          const qr = await green("qr").catch(() => ({}));
          return ok({ state: state.stateInstance, qr: qr?.type === "qrCode" ? qr.message : null });
        }
        const s = await green("getWaSettings");
        const phone = s.phone ? `+${String(s.phone).replace(/\D/g, "")}` : "WhatsApp";
        const instanceKey = String(greenId);

        // One gateway instance belongs to one client only
        const { data: other } = await supabase.from("whatsapp_numbers").select("id, client_id")
          .eq("phone_number_id", instanceKey).maybeSingle();
        if (other && other.client_id !== clientId) {
          return ok({ state: "authorized", error: "This WhatsApp line is already linked to another client." });
        }
        const { error: upErr } = other
          ? await supabase.from("whatsapp_numbers").update({ status: "connected", phone_number: phone }).eq("id", other.id)
          : await supabase.from("whatsapp_numbers").insert({
              client_id: clientId, tenant_id: tenantId, phone_number: phone,
              phone_number_id: instanceKey, waba_id: "green-api", status: "connected",
            });
        if (upErr) return ok({ state: "authorized", error: upErr.message });
        return ok({ state: "connected", phoneNumber: phone });
      }

      case "qr-logout": {
        await green("logout");
        await supabase.from("whatsapp_numbers").update({ status: "disconnected" })
          .eq("phone_number_id", String(greenId)).eq("client_id", clientId);
        return ok({ success: true });
      }

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
        // Find WABAs via the token's granted asset IDs (needs only whatsapp_business_management).
        // /me/businesses requires business_management, which system-user tokens often lack.
        const wabas: Array<{ id: string; name: string; businessId: string; businessName: string; status: string }> = [];
        const seen = new Set<string>();

        const debugRes = await fetch(
          `${GRAPH_BASE}/debug_token?input_token=${whatsappToken}&access_token=${whatsappToken}`
        );
        const debugData = await debugRes.json().catch(() => ({}));
        const wabaIds: string[] = [];
        for (const s of debugData?.data?.granular_scopes || []) {
          if (s.scope === "whatsapp_business_management" || s.scope === "whatsapp_business_messaging") {
            for (const id of s.target_ids || []) if (!wabaIds.includes(id)) wabaIds.push(id);
          }
        }

        for (const id of wabaIds) {
          const r = await fetch(
            `${GRAPH_BASE}/${id}?fields=id,name,account_review_status,owner_business_info&access_token=${whatsappToken}`
          );
          if (!r.ok) {
            console.error(`WABA ${id} lookup failed`, r.status, await r.text());
            continue;
          }
          const w = await r.json();
          seen.add(w.id);
          wabas.push({
            id: w.id,
            name: w.name || "Unnamed WABA",
            businessId: w.owner_business_info?.id || "",
            businessName: w.owner_business_info?.name || "",
            status: w.account_review_status || "unknown",
          });
        }

        // System users: assets assigned directly to the token's user
        if (wabas.length === 0) {
          const meRes = await fetch(`${GRAPH_BASE}/me?fields=id&access_token=${whatsappToken}`);
          const me = await meRes.json().catch(() => ({}));
          if (me?.id) {
            const aRes = await fetch(
              `${GRAPH_BASE}/${me.id}/assigned_whatsapp_business_accounts?fields=id,name,account_review_status,owner_business_info&access_token=${whatsappToken}`
            );
            const aData = await aRes.json().catch(() => ({}));
            if (!aRes.ok) console.error("assigned WABAs lookup failed", aRes.status, JSON.stringify(aData));
            for (const w of aData?.data || []) {
              if (seen.has(w.id)) continue;
              seen.add(w.id);
              wabas.push({
                id: w.id,
                name: w.name || "Unnamed WABA",
                businessId: w.owner_business_info?.id || "",
                businessName: w.owner_business_info?.name || "",
                status: w.account_review_status || "unknown",
              });
            }
          }
        }

        // Fallback: business listing (only works if token has business_management)
        let fallbackError: string | null = null;
        if (wabas.length === 0) {
          const wabasRes = await fetch(
            `${GRAPH_BASE}/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,account_review_status}&access_token=${whatsappToken}`
          );
          const wabasData = await wabasRes.json().catch(() => ({}));
          if (!wabasRes.ok) {
            fallbackError = wabasData?.error?.message || "Failed to fetch WABAs";
          } else {
            for (const business of wabasData.data || []) {
              for (const waba of business.owned_whatsapp_business_accounts?.data || []) {
                if (seen.has(waba.id)) continue;
                wabas.push({
                  id: waba.id,
                  name: waba.name || "Unnamed WABA",
                  businessId: business.id,
                  businessName: business.name,
                  status: waba.account_review_status || "unknown",
                });
              }
            }
          }
        }

        if (wabas.length === 0) {
          return new Response(
            JSON.stringify({
              wabas: [],
              error:
                "No WhatsApp Business Accounts are shared with the platform token. In Meta Business Settings, assign the WhatsApp account to the system user (Full control) and regenerate the token with whatsapp_business_management." +
                (fallbackError ? ` (Meta: ${fallbackError})` : ""),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ wabas }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "lookup-waba": {
        if (!wabaId || !/^\d{5,25}$/.test(String(wabaId))) {
          return new Response(JSON.stringify({ error: "Enter a valid numeric WhatsApp Business Account ID" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const r = await fetch(
          `${GRAPH_BASE}/${wabaId}?fields=id,name,account_review_status,owner_business_info&access_token=${whatsappToken}`
        );
        const w = await r.json().catch(() => ({}));
        if (!r.ok) {
          return new Response(
            JSON.stringify({ error: `Meta could not open this account: ${w?.error?.message || "unknown error"}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            waba: {
              id: w.id,
              name: w.name || "Unnamed WABA",
              businessId: w.owner_business_info?.id || "",
              businessName: w.owner_business_info?.name || "",
              status: w.account_review_status || "unknown",
            },
          }),
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

      case "embedded-signup": {
        const { code, phoneNumberId: esPhoneId, wabaId: esWabaId } = body;
        const appId = Deno.env.get("META_APP_ID") || "1635724714898789";
        const appSecret = Deno.env.get("META_APP_SECRET");
        const json = (o: unknown, s = 200) =>
          new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (!appSecret) return json({ error: "Meta App Secret is not configured" });
        if (typeof code !== "string" || !/^\d{5,25}$/.test(String(esWabaId)) || !/^\d{5,25}$/.test(String(esPhoneId))) {
          return json({ error: "Signup did not return the WhatsApp account. Please try again." });
        }
        // Exchange code for the business's token (validates the signup)
        const tRes = await fetch(
          `${GRAPH_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`
        );
        const tData = await tRes.json().catch(() => ({}));
        if (!tRes.ok || !tData.access_token) {
          console.error("Code exchange failed", tRes.status, tData?.error?.message);
          return json({ error: `Meta signup could not be completed: ${tData?.error?.message || "unknown error"}` });
        }
        const bizToken = tData.access_token as string;
        // Subscribe our app to the WABA's webhooks
        const subRes = await fetch(`${GRAPH_BASE}/${esWabaId}/subscribed_apps`, {
          method: "POST",
          headers: { Authorization: `Bearer ${bizToken}` },
        });
        if (!subRes.ok) console.error("subscribed_apps failed", await subRes.text());
        // Read phone number details
        const pRes = await fetch(
          `${GRAPH_BASE}/${esPhoneId}?fields=display_phone_number,verified_name`,
          { headers: { Authorization: `Bearer ${bizToken}` } }
        );
        const p = await pRes.json().catch(() => ({}));
        const display = p.display_phone_number || esPhoneId;

        const { data: existing } = await supabase
          .from("whatsapp_numbers").select("id")
          .eq("phone_number_id", esPhoneId).eq("client_id", clientId).maybeSingle();
        const { error: upErr } = existing
          ? await supabase.from("whatsapp_numbers").update({ status: "connected", waba_id: esWabaId }).eq("id", existing.id)
          : await supabase.from("whatsapp_numbers").insert({
              client_id: clientId, tenant_id: tenantId, phone_number: display,
              phone_number_id: esPhoneId, waba_id: esWabaId, status: "connected",
            });
        if (upErr) return json({ error: upErr.message });
        return json({ success: true, phoneNumber: display });
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

      case "disconnect": {
        const { numberId } = body;
        if (!numberId) {
          return new Response(JSON.stringify({ error: "numberId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update status to disconnected
        const { error: updateError } = await supabase
          .from("whatsapp_numbers")
          .update({ status: "disconnected" })
          .eq("id", numberId)
          .eq("client_id", clientId);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "reconnect": {
        const { numberId } = body;
        if (!numberId) {
          return new Response(JSON.stringify({ error: "numberId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Validate the token is still valid
        const tokenValidRes = await fetch(`${GRAPH_BASE}/me?access_token=${whatsappToken}`);
        if (!tokenValidRes.ok) {
          return new Response(
            JSON.stringify({ error: "WhatsApp token is no longer valid. Please contact support." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get the number details to verify it still exists in Meta
        const { data: numberData, error: numberError } = await supabase
          .from("whatsapp_numbers")
          .select("phone_number_id, waba_id")
          .eq("id", numberId)
          .eq("client_id", clientId)
          .single();

        if (numberError || !numberData) {
          return new Response(
            JSON.stringify({ error: "Number not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify the phone number still exists in Meta
        const phoneRes = await fetch(
          `${GRAPH_BASE}/${numberData.phone_number_id}?fields=display_phone_number,verified_name&access_token=${whatsappToken}`
        );

        if (!phoneRes.ok) {
          return new Response(
            JSON.stringify({ error: "Phone number no longer exists in your Meta account. Please add it again." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update status to connected
        const { error: updateError } = await supabase
          .from("whatsapp_numbers")
          .update({ status: "connected" })
          .eq("id", numberId)
          .eq("client_id", clientId);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "remove": {
        const { numberId } = body;
        if (!numberId) {
          return new Response(JSON.stringify({ error: "numberId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Delete the WhatsApp number
        const { error: deleteError } = await supabase
          .from("whatsapp_numbers")
          .delete()
          .eq("id", numberId)
          .eq("client_id", clientId);

        if (deleteError) {
          return new Response(
            JSON.stringify({ error: deleteError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
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
