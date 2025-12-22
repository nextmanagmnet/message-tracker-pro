import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to hash phone number using SHA256
async function hashPhone(phone: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone.replace(/\D/g, ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if message is a real conversation (not spam/bot)
function isRealMessage(message: string): boolean {
  // Rule 1: Must be longer than 6 characters
  if (message.length <= 6) {
    return false;
  }
  
  // Rule 2: Not emoji-only
  const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+$/u;
  if (emojiRegex.test(message)) {
    return false;
  }
  
  // Rule 3: Not common spam patterns
  const spamPatterns = [
    /^(hi|hello|hey|ok|yes|no|sure|thanks|thank you)$/i,
    /^\d+$/,
    /^[!?.,]+$/,
  ];
  
  if (spamPatterns.some(pattern => pattern.test(message.trim()))) {
    return false;
  }
  
  // Rule 4: Contains meaningful intent (letters and words)
  const words = message.split(/\s+/).filter(w => w.length > 2);
  if (words.length < 2) {
    return false;
  }
  
  return true;
}

// Extract ttclid from message if present
function extractTtclid(message: string): string | null {
  // Look for ttclid in the message (might be in a URL or mentioned directly)
  const ttclidMatch = message.match(/ttclid[=:]?\s*([a-zA-Z0-9_-]+)/i);
  if (ttclidMatch) {
    return ttclidMatch[1];
  }
  
  // Check for TikTok tracking URL
  const urlMatch = message.match(/tiktok\.com[^\s]*ttclid=([^&\s]+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  
  // WhatsApp webhook verification (GET request)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WhatsApp webhook verified');
      return new Response(challenge, { status: 200 });
    }
    
    console.error('WhatsApp webhook verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  // Handle incoming webhook (POST request)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Received WhatsApp webhook:', JSON.stringify(body, null, 2));
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Process each entry in the webhook
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;
          
          const value = change.value;
          const phoneNumberId = value.metadata?.phone_number_id;
          
          // Find the WhatsApp number in our database (now with client_id)
          const { data: whatsappNumber, error: numberError } = await supabase
            .from('whatsapp_numbers')
            .select('id, client_id, tenant_id')
            .eq('phone_number_id', phoneNumberId)
            .single();
          
          if (numberError || !whatsappNumber) {
            console.log(`WhatsApp number ${phoneNumberId} not found in database`);
            continue;
          }
          
          if (!whatsappNumber.client_id) {
            console.log(`WhatsApp number ${phoneNumberId} has no client_id`);
            continue;
          }
          
          // Process each message
          for (const message of value.messages || []) {
            if (message.type !== 'text') continue;
            
            const senderPhone = message.from;
            const messageText = message.text?.body || '';
            const phoneHash = await hashPhone(senderPhone);
            
            // Check if we already have a lead from this phone number for this client
            const { data: existingLead } = await supabase
              .from('leads')
              .select('id')
              .eq('client_id', whatsappNumber.client_id)
              .eq('sender_phone_hash', phoneHash)
              .maybeSingle();
            
            if (existingLead) {
              console.log(`Already have a lead from ${phoneHash} for client ${whatsappNumber.client_id}, skipping`);
              continue;
            }
            
            // Determine if this is a real message
            const isReal = isRealMessage(messageText);
            const ttclid = extractTtclid(messageText);
            
            // Insert the lead with client_id
            const { data: newLead, error: insertError } = await supabase
              .from('leads')
              .insert({
                client_id: whatsappNumber.client_id,
                tenant_id: whatsappNumber.tenant_id, // Keep for backwards compat
                whatsapp_number_id: whatsappNumber.id,
                sender_phone_hash: phoneHash,
                ttclid: ttclid,
                first_message: messageText,
                status: isReal ? 'verified' : 'pending',
                is_real: isReal,
              })
              .select()
              .single();
            
            if (insertError) {
              console.error('Error inserting lead:', insertError);
              continue;
            }
            
            console.log(`Created lead ${newLead.id} for client ${whatsappNumber.client_id}, is_real: ${isReal}, ttclid: ${ttclid}`);
            
            // If real and has ttclid, send conversion event to TikTok
            if (isReal && ttclid) {
              await sendTikTokConversion(supabase, whatsappNumber.client_id, phoneHash, ttclid);
            }
          }
        }
      }
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } catch (error: unknown) {
      console.error('Error processing WhatsApp webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response('Method not allowed', { status: 405 });
});

// Send conversion event to TikTok CAPI
async function sendTikTokConversion(
  supabase: any,
  clientId: string,
  phoneHash: string,
  ttclid: string
) {
  try {
    // Get TikTok account for this client
    const { data: account, error } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle();
    
    if (error || !account) {
      console.log('No TikTok account found for client');
      return;
    }
    
    // Get pixel for this client
    const { data: pixel, error: pixelError } = await supabase
      .from('tiktok_pixels')
      .select('pixel_code')
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle();
    
    if (pixelError || !pixel) {
      console.log('No TikTok Pixel found for client');
      return;
    }
    
    // Send conversion event via TikTok Events API
    const eventData = {
      pixel_code: pixel.pixel_code,
      event: 'Contact',
      event_time: Math.floor(Date.now() / 1000),
      user: {
        ttclid: ttclid,
        phone: [phoneHash], // Already SHA256 hashed
      },
      properties: {
        content_type: 'product',
        description: 'WhatsApp real conversation',
      },
      page: {
        url: 'https://wa.me/',
      },
      event_source: 'whatsapp',
    };
    
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
      method: 'POST',
      headers: {
        'Access-Token': account.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [eventData],
      }),
    });
    
    const result = await response.json();
    console.log('TikTok conversion event sent for client:', clientId, result);
    
  } catch (error) {
    console.error('Error sending TikTok conversion:', error);
  }
}
