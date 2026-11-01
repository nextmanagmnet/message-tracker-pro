// Row shapes for the columns the edge functions select. Keep in sync with the migrations;
// src/integrations/supabase/types.ts is the generated reference (not importable from here).
import type { Stage } from "./funnel.ts";

// leads, as selected by LEAD_COLS in conversions.ts
export interface LeadRow {
  id: string;
  client_id: string | null;
  stage: Stage;
  ad_platform: string | null;
  ttclid: string | null;
  ctwa_clid: string | null;
  fbclid: string | null;
  message_received_at: string | null;
  sender_phone_hash: string;
  order_value: number | null;
  order_currency: string | null;
}

export interface ConversionEventRow {
  id: string;
  client_id: string;
  lead_id: string;
  platform: string;
  event_name: string;
  event_id: string;
  value: number | null;
  currency: string | null;
  attempts: number;
}
