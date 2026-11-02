import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isOrderMessage, parseOrder } from "../_shared/orders.ts";
import { reportStage } from "../_shared/conversions.ts";
import { isOptOut } from "../_shared/funnel.ts";
import { createLead } from "./leads.ts";
import type { WaMessage } from "./parse.ts";

async function hashPhone(phone: string): Promise<string> {
  const data = new TextEncoder().encode(phone.replace(/\D/g, ''));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function findNumber(supabase: SupabaseClient, key: string) {
  const { data } = await supabase
    .from('whatsapp_numbers').select('id, client_id, tenant_id, status')
    .eq('phone_number_id', key).maybeSingle();
  return data?.client_id ? data : null;
}

async function aiEnabled(supabase: SupabaseClient, clientId: string): Promise<boolean> {
  const { data } = await supabase.from('ai_agent_settings').select('enabled').eq('client_id', clientId).maybeSingle();
  return Boolean(data?.enabled);
}

function triggerAiAgent(conversationId: string) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const p = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'x-internal-key': key },
    body: JSON.stringify({ conversationId }),
  }).catch((e) => console.error('ai-agent trigger failed', e));
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(p);
}

// Stores one message (either direction) on the sender's lead/conversation.
export async function handleMessage(supabase: SupabaseClient, m: WaMessage) {
  const clientId = m.num.client_id;
  const phoneHash = await hashPhone(m.jid.split('@')[0]);
  const now = m.ts.toISOString();

  const { data: existingLead } = await supabase.from('leads').select('id')
    .eq('client_id', clientId).eq('sender_phone_hash', phoneHash)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  // ---- Outgoing: the business typed on its phone (or the echo of an AI send)
  if (m.fromMe) {
    if (!existingLead) return; // business started the chat; not an ad lead
    const { data: conv } = await supabase.from('conversations').select('id, agent_status')
      .eq('lead_id', existingLead.id).maybeSingle();
    if (!conv) return;
    if (m.externalId) {
      const { data: known } = await supabase.from('messages').select('id').eq('external_id', m.externalId).maybeSingle();
      if (known) return;
      const { data: pending } = await supabase.from('messages').select('id')
        .eq('conversation_id', conv.id).eq('author', 'ai').eq('text', m.text)
        .like('external_id', 'pending:%').limit(1).maybeSingle();
      if (pending) {
        await supabase.from('messages').update({ external_id: m.externalId }).eq('id', pending.id);
        return;
      }
    }
    const { error } = await supabase.from('messages').insert({
      conversation_id: conv.id, client_id: clientId, direction: 'out', author: 'owner', text: m.text, external_id: m.externalId,
    });
    if (error?.code === '23505') return;
    const patch: Record<string, unknown> = { last_outbound_at: now, last_message_at: now };
    if (conv.agent_status === 'ai_active') patch.agent_status = 'handed_off'; // owner took over
    await supabase.from('conversations').update(patch).eq('id', conv.id);
    // The business's order-confirmation message counts as a sale.
    const { data: client } = await supabase.from('clients').select('order_marker').eq('id', clientId).maybeSingle();
    if (isOrderMessage(m.text, client?.order_marker)) {
      await reportStage(supabase, existingLead.id, 'client', parseOrder(m.text));
    }
    return;
  }

  // ---- Incoming from the customer
  let leadId = existingLead?.id as string | undefined;
  let newRealLead = false;
  if (!leadId) {
    const created = await createLead(supabase, m, phoneHash);
    if (!created) return;
    leadId = created.id;
    newRealLead = created.isReal;
  }

  const ai = await aiEnabled(supabase, clientId);
  let { data: conv } = await supabase.from('conversations').select('id, agent_status').eq('lead_id', leadId).maybeSingle();
  if (!conv) {
    const { data: inserted, error } = await supabase.from('conversations').insert({
      client_id: clientId,
      whatsapp_number_id: m.num.id,
      lead_id: leadId,
      agent_status: ai ? 'ai_active' : 'off',
      follow_up_count: 0,
    }).select('id, agent_status').single();
    if (error) {
      // Concurrent delivery created it first.
      ({ data: conv } = await supabase.from('conversations').select('id, agent_status').eq('lead_id', leadId).maybeSingle());
    } else {
      conv = inserted;
      await supabase.from('conversation_contacts').insert({ conversation_id: conv.id, contact_jid: m.jid });
    }
  }
  if (!conv) return;

  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conv.id, client_id: clientId, direction: 'in', author: 'lead', text: m.text, external_id: m.externalId,
  });
  if (msgErr?.code === '23505') return; // duplicate delivery
  if (msgErr) console.error('message insert failed', msgErr);

  const patch: Record<string, unknown> = { last_inbound_at: now, last_message_at: now, follow_up_count: 0 };
  let status = conv.agent_status;
  if (isOptOut(m.text)) status = patch.agent_status = 'opted_out';
  else if (ai && status === 'off') status = patch.agent_status = 'ai_active';
  await supabase.from('conversations').update(patch).eq('id', conv.id);

  if (newRealLead) await reportStage(supabase, leadId, 'real');
  if (ai && status === 'ai_active') triggerAiAgent(conv.id);
}
