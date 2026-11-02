import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cron.ts";
import { withCors } from "../_shared/cors.ts";
import { findNumber, handleMessage } from "./messages.ts";
import {
  type EvolutionBody, type EvolutionItem, type GreenBody, type MetaMessage,
  parseEvolutionItem, parseGreenMessage, parseMetaMessage,
} from "./parse.ts";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Meta signs every Cloud API delivery with HMAC-SHA256 of the raw body (App Secret). Fails closed.
async function verifyMetaSignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!secret || !header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const provided = header.slice(7);
  if (provided.length !== mac.length * 2) return false;
  return timingSafeEqual(hexToBytes(provided), mac);
}

// QR gateways (Evolution / Green-API) send the shared bearer token we registered. Fails closed.
function verifyGatewayToken(req: Request): boolean {
  const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
  return !!expected && (req.headers.get('authorization') || '') === `Bearer ${expected}`;
}

async function handleEvolution(supabase: SupabaseClient, body: EvolutionBody) {
  const num = await findNumber(supabase, String(body.instance));
  if (!num) {
    console.log('Gateway instance not mapped to a client, skipping');
    return;
  }
  const event = String(body.event).toLowerCase().replace(/_/g, '.');

  if (event === 'connection.update') {
    const s = (body.data as { state?: string } | undefined)?.state;
    if (s === 'open' || s === 'close') {
      await supabase.from('whatsapp_numbers')
        .update({ status: s === 'open' ? 'connected' : 'disconnected' }).eq('id', num.id);
    }
    return;
  }
  if (event !== 'messages.upsert') return;

  const items: EvolutionItem[] = Array.isArray(body.data) ? body.data : [body.data as EvolutionItem];
  for (const d of items) {
    const m = parseEvolutionItem(d);
    if (m) await handleMessage(supabase, { num, ...m });
  }
}

async function handleGreen(supabase: SupabaseClient, body: GreenBody) {
  const num = await findNumber(supabase, String(body.instanceData?.idInstance ?? ''));
  if (!num) {
    console.log('Gateway instance not mapped to a client, skipping');
    return;
  }

  if (body.typeWebhook === 'stateInstanceChanged') {
    await supabase.from('whatsapp_numbers')
      .update({ status: body.stateInstance === 'authorized' ? 'connected' : 'disconnected' }).eq('id', num.id);
    return;
  }
  const m = parseGreenMessage(body);
  if (m) await handleMessage(supabase, { num, ...m });
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const ok = () => json({ success: true });
  const deny = () => json({ error: 'Unauthorized' }, 401);

  // Meta webhook verification handshake
  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    if (verifyToken && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken) {
      return new Response(url.searchParams.get('hub.challenge'), { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const supabase = serviceClient();

    if (typeof body?.event === 'string' && body?.instance) {
      if (!verifyGatewayToken(req)) return deny();
      await handleEvolution(supabase, body);
      return ok();
    }
    if (body?.typeWebhook) {
      if (!verifyGatewayToken(req)) return deny();
      await handleGreen(supabase, body);
      return ok();
    }

    // Meta Cloud API format
    if (!(await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256')))) return deny();
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const num = await findNumber(supabase, value.metadata?.phone_number_id);
        if (!num) continue;
        for (const message of (value.messages || []) as MetaMessage[]) {
          await handleMessage(supabase, { num, ...parseMetaMessage(message) });
        }
      }
    }
    return ok();
  } catch (error: unknown) {
    console.error('Error processing WhatsApp webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: errorMessage }, 500);
  }
}));
