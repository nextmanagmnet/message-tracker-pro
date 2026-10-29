// Sends a WhatsApp text on behalf of the business (AI replies and follow-ups).
// Only Evolution (QR) lines can send; Meta Cloud API / Green-API lines are receive-only here.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendWhatsAppText(
  supabase: any,
  conversationId: string,
  text: string,
  opts: { humanDelay?: boolean } = {},
): Promise<boolean> {
  const { data: conv } = await supabase
    .from("conversations").select("id, client_id, whatsapp_number_id").eq("id", conversationId).maybeSingle();
  if (!conv) return false;
  const [{ data: line }, { data: contact }] = await Promise.all([
    supabase.from("whatsapp_numbers").select("phone_number_id, waba_id").eq("id", conv.whatsapp_number_id).maybeSingle(),
    supabase.from("conversation_contacts").select("contact_jid").eq("conversation_id", conversationId).maybeSingle(),
  ]);
  if (!line || !contact?.contact_jid) return false;
  if (line.waba_id !== "evolution") {
    console.warn(`Sending not supported for ${line.waba_id} lines`);
    return false;
  }

  const base = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY") || "";
  if (!base || !key) return false;

  // Placeholder first so the webhook's echo of our own message isn't mistaken for the owner typing.
  const pendingId = `pending:${crypto.randomUUID()}`;
  const { data: row } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    client_id: conv.client_id,
    direction: "out",
    author: "ai",
    text,
    external_id: pendingId,
  }).select("id").single();

  if (opts.humanDelay) await sleep(2000 + Math.random() * 4000);

  const res = await fetch(`${base}/message/sendText/${line.phone_number_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: String(contact.contact_jid).split("@")[0], text }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Evolution send failed", res.status, JSON.stringify(d));
    if (row) await supabase.from("messages").delete().eq("id", row.id);
    return false;
  }

  const now = new Date().toISOString();
  if (row && d?.key?.id) {
    // The webhook echo may have already claimed it; ignore the unique conflict then.
    await supabase.from("messages").update({ external_id: d.key.id }).eq("id", row.id);
  }
  await supabase.from("conversations").update({ last_outbound_at: now, last_message_at: now }).eq("id", conversationId);
  return true;
}
