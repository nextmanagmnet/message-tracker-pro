import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import type { EvolutionClient } from "./evolution.ts";

export const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// Request body; each action reads only its own fields.
export interface ConnectBody {
  action?: string;
  clientId?: string;
  wabaId?: string;
  phoneNumbers?: Array<{ phoneNumberId: string; displayPhoneNumber?: string }>;
  instance?: unknown;
  numberId?: string;
  code?: unknown;
  phoneNumberId?: string;
}

// Everything an action needs once the caller is authorized for clientId.
export interface ConnectContext {
  supabase: SupabaseClient;
  supabaseUrl: string;
  whatsappToken: string;
  body: ConnectBody;
  clientId: string;
  // For now, we'll use the agency_id as tenant_id since we're in agency model
  tenantId: string;
  evo: EvolutionClient;
}
