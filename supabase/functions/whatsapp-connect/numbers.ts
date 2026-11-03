import { json } from "../_shared/cron.ts";
import { type ConnectContext, GRAPH_BASE } from "./types.ts";

// Saved numbers (either provider): disconnect, reconnect, remove.

export async function disconnect({ body, supabase, clientId, evo }: ConnectContext): Promise<Response> {
  const { numberId } = body;
  if (!numberId) return json({ error: "numberId is required" }, 400);

  const { data: dNum } = await supabase
    .from("whatsapp_numbers")
    .select("waba_id, phone_number_id")
    .eq("id", numberId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (dNum?.waba_id === "evolution" && evo.base && evo.key) {
    await evo
      .call(`/instance/logout/${dNum.phone_number_id}`, { method: "DELETE" })
      .catch((e) => console.error("logout failed", e));
  }

  // Update status to disconnected
  const { error: updateError } = await supabase
    .from("whatsapp_numbers")
    .update({ status: "disconnected" })
    .eq("id", numberId)
    .eq("client_id", clientId);

  if (updateError) return json({ error: updateError.message }, 400);
  return json({ success: true });
}

export async function reconnect({ body, supabase, clientId, evo, whatsappToken }: ConnectContext): Promise<Response> {
  const { numberId } = body;
  if (!numberId) return json({ error: "numberId is required" }, 400);

  const { data: gNum } = await supabase
    .from("whatsapp_numbers")
    .select("waba_id, phone_number_id")
    .eq("id", numberId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (gNum?.waba_id === "evolution" || gNum?.waba_id === "green-api") {
    const st = gNum.waba_id === "evolution" && evo.base ? await evo.state(gNum.phone_number_id) : "close";
    if (st !== "open") {
      return json({ error: "Please click Add Number and scan the QR code again." }, 400);
    }
    await supabase.from("whatsapp_numbers").update({ status: "connected" }).eq("id", numberId);
    return json({ success: true });
  }

  // Validate the token is still valid
  const tokenValidRes = await fetch(`${GRAPH_BASE}/me?access_token=${encodeURIComponent(whatsappToken)}`);
  if (!tokenValidRes.ok) {
    return json({ error: "WhatsApp token is no longer valid. Please contact support." }, 400);
  }

  // Get the number details to verify it still exists in Meta
  const { data: numberData, error: numberError } = await supabase
    .from("whatsapp_numbers")
    .select("phone_number_id, waba_id")
    .eq("id", numberId)
    .eq("client_id", clientId)
    .single();

  if (numberError || !numberData) return json({ error: "Number not found" }, 404);

  // Verify the phone number still exists in Meta
  const phoneRes = await fetch(
    `${GRAPH_BASE}/${numberData.phone_number_id}?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(whatsappToken)}`,
  );
  if (!phoneRes.ok) {
    return json({ error: "Phone number no longer exists in your Meta account. Please add it again." }, 400);
  }

  // Update status to connected
  const { error: updateError } = await supabase
    .from("whatsapp_numbers")
    .update({ status: "connected" })
    .eq("id", numberId)
    .eq("client_id", clientId);

  if (updateError) return json({ error: updateError.message }, 400);
  return json({ success: true });
}

export async function remove({ body, supabase, clientId }: ConnectContext): Promise<Response> {
  const { numberId } = body;
  if (!numberId) return json({ error: "numberId is required" }, 400);

  // Delete the WhatsApp number
  const { error: deleteError } = await supabase
    .from("whatsapp_numbers")
    .delete()
    .eq("id", numberId)
    .eq("client_id", clientId);

  if (deleteError) return json({ error: deleteError.message }, 400);
  return json({ success: true });
}
