import { limitError } from "../_shared/auth.ts";
import { json } from "../_shared/cron.ts";
import { type ConnectContext, GRAPH_BASE } from "./types.ts";

// Meta Cloud API: find the platform token's WABAs and import their numbers.

interface Waba {
  id: string;
  name: string;
  businessId: string;
  businessName: string;
  status: string;
}

export async function validateToken({ whatsappToken }: ConnectContext): Promise<Response> {
  // Validate the WhatsApp token by fetching business info
  const meRes = await fetch(`${GRAPH_BASE}/me?access_token=${encodeURIComponent(whatsappToken)}`);
  if (!meRes.ok) {
    const errData = await meRes.json();
    return json({ valid: false, error: errData.error?.message || "Invalid token" });
  }
  const meData = await meRes.json();
  return json({ valid: true, user: meData });
}

export async function fetchWabas({ whatsappToken }: ConnectContext): Promise<Response> {
  // Find WABAs via the token's granted asset IDs (needs only whatsapp_business_management).
  // /me/businesses requires business_management, which system-user tokens often lack.
  const wabas: Waba[] = [];
  const seen = new Set<string>();

  const debugRes = await fetch(
    `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(whatsappToken)}&access_token=${encodeURIComponent(whatsappToken)}`,
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
      `${GRAPH_BASE}/${id}?fields=id,name,account_review_status,owner_business_info&access_token=${encodeURIComponent(whatsappToken)}`,
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
    const meRes = await fetch(`${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(whatsappToken)}`);
    const me = await meRes.json().catch(() => ({}));
    if (me?.id) {
      const aRes = await fetch(
        `${GRAPH_BASE}/${me.id}/assigned_whatsapp_business_accounts?fields=id,name,account_review_status,owner_business_info&access_token=${encodeURIComponent(whatsappToken)}`,
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
      `${GRAPH_BASE}/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,account_review_status}&access_token=${encodeURIComponent(whatsappToken)}`,
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
    return json({
      wabas: [],
      error:
        "No WhatsApp Business Accounts are shared with the platform token. In Meta Business Settings, assign the WhatsApp account to the system user (Full control) and regenerate the token with whatsapp_business_management." +
        (fallbackError ? ` (Meta: ${fallbackError})` : ""),
    });
  }

  return json({ wabas });
}

export async function lookupWaba({ body, whatsappToken }: ConnectContext): Promise<Response> {
  const { wabaId } = body;
  if (!wabaId || !/^\d{5,25}$/.test(String(wabaId))) {
    return json({ error: "Enter a valid numeric WhatsApp Business Account ID" });
  }
  const r = await fetch(
    `${GRAPH_BASE}/${wabaId}?fields=id,name,account_review_status,owner_business_info&access_token=${encodeURIComponent(whatsappToken)}`,
  );
  const w = await r.json().catch(() => ({}));
  if (!r.ok) {
    return json({ error: `Meta could not open this account: ${w?.error?.message || "unknown error"}` });
  }
  return json({
    waba: {
      id: w.id,
      name: w.name || "Unnamed WABA",
      businessId: w.owner_business_info?.id || "",
      businessName: w.owner_business_info?.name || "",
      status: w.account_review_status || "unknown",
    },
  });
}

export async function fetchPhoneNumbers({ body, whatsappToken }: ConnectContext): Promise<Response> {
  const { wabaId } = body;
  if (!wabaId) return json({ error: "wabaId is required" }, 400);

  // Fetch phone numbers for a WABA
  const phonesRes = await fetch(
    `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type&access_token=${encodeURIComponent(whatsappToken)}`,
  );
  if (!phonesRes.ok) {
    const errData = await phonesRes.json();
    return json({ error: errData.error?.message || "Failed to fetch phone numbers" }, 400);
  }
  const phonesData = await phonesRes.json();

  const phones = (phonesData.data || []).map(
    (p: {
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      platform_type?: string;
    }) => ({
      id: p.id,
      phoneNumber: p.display_phone_number,
      verifiedName: p.verified_name,
      qualityRating: p.quality_rating,
      platformType: p.platform_type,
    }),
  );

  return json({ phoneNumbers: phones });
}

export async function embeddedSignup({ body, supabase, clientId, tenantId }: ConnectContext): Promise<Response> {
  const { code, phoneNumberId: esPhoneId, wabaId: esWabaId } = body;
  const appId = Deno.env.get("META_APP_ID") || "1635724714898789";
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) return json({ error: "Meta App Secret is not configured" });
  if (typeof code !== "string" || !/^\d{5,25}$/.test(String(esWabaId)) || !/^\d{5,25}$/.test(String(esPhoneId))) {
    return json({ error: "Signup did not return the WhatsApp account. Please try again." });
  }
  // Exchange code for the business's token (validates the signup)
  const tRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`,
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
  const pRes = await fetch(`${GRAPH_BASE}/${esPhoneId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${bizToken}` },
  });
  const p = await pRes.json().catch(() => ({}));
  const display = p.display_phone_number || esPhoneId;

  const { data: existing } = await supabase
    .from("whatsapp_numbers")
    .select("id")
    .eq("phone_number_id", esPhoneId)
    .eq("client_id", clientId)
    .maybeSingle();
  const { error: upErr } = existing
    ? await supabase.from("whatsapp_numbers").update({ status: "connected", waba_id: esWabaId }).eq("id", existing.id)
    : await supabase.from("whatsapp_numbers").insert({
        client_id: clientId,
        tenant_id: tenantId,
        phone_number: display,
        phone_number_id: esPhoneId,
        waba_id: esWabaId,
        status: "connected",
      });
  if (upErr) return limitError(upErr) ?? json({ error: upErr.message });
  return json({ success: true, phoneNumber: display });
}

export async function importNumbers({ body, supabase, clientId, tenantId }: ConnectContext): Promise<Response> {
  const { wabaId, phoneNumbers } = body;
  if (!wabaId || !phoneNumbers || !Array.isArray(phoneNumbers)) {
    return json({ error: "wabaId and phoneNumbers array are required" }, 400);
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
      await supabase.from("whatsapp_numbers").update({ status: "connected" }).eq("id", existing.id);
      imported.push(phoneNumberId);
      continue;
    }

    // Insert new
    const { error: insertError } = await supabase.from("whatsapp_numbers").insert({
      client_id: clientId,
      tenant_id: tenantId,
      phone_number: displayPhoneNumber,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      status: "connected",
    });

    if (insertError) {
      const limited = limitError(insertError);
      if (limited) return limited;
      failed.push({ phoneNumberId, error: insertError.message });
    } else {
      imported.push(phoneNumberId);
    }
  }

  return json({ imported, failed });
}
