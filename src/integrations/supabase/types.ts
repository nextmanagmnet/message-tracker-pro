export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_members: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["agency_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_settings: {
        Row: {
          allowed_hours_end: number
          allowed_hours_start: number
          business_knowledge: string | null
          client_id: string
          enabled: boolean
          follow_up_delay_hours: number
          follow_up_enabled: boolean
          follow_up_max: number
          handoff_rules: string | null
          qualifying_questions: string | null
          timezone: string
          tone: string | null
          updated_at: string
        }
        Insert: {
          allowed_hours_end?: number
          allowed_hours_start?: number
          business_knowledge?: string | null
          client_id: string
          enabled?: boolean
          follow_up_delay_hours?: number
          follow_up_enabled?: boolean
          follow_up_max?: number
          handoff_rules?: string | null
          qualifying_questions?: string | null
          timezone?: string
          tone?: string | null
          updated_at?: string
        }
        Update: {
          allowed_hours_end?: number
          allowed_hours_start?: number
          business_knowledge?: string | null
          client_id?: string
          enabled?: boolean
          follow_up_delay_hours?: number
          follow_up_enabled?: boolean
          follow_up_max?: number
          handoff_rules?: string | null
          qualifying_questions?: string | null
          timezone?: string
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          name: string
          order_marker: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          name: string
          order_marker?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          name?: string
          order_marker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_contacts: {
        Row: {
          contact_jid: string
          conversation_id: string
        }
        Insert: {
          contact_jid: string
          conversation_id: string
        }
        Update: {
          contact_jid?: string
          conversation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_contacts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_status: string
          analyzed_at: string | null
          client_id: string
          created_at: string
          follow_up_count: number
          id: string
          last_follow_up_at: string | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          lead_id: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          agent_status?: string
          analyzed_at?: string | null
          client_id: string
          created_at?: string
          follow_up_count?: number
          id?: string
          last_follow_up_at?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          lead_id?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          agent_status?: string
          analyzed_at?: string | null
          client_id?: string
          created_at?: string
          follow_up_count?: number
          id?: string
          last_follow_up_at?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          lead_id?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_events: {
        Row: {
          attempts: number
          client_id: string
          created_at: string
          currency: string | null
          event_id: string
          event_name: string
          id: string
          lead_id: string
          platform: string
          response: Json | null
          sent_at: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          status: string
          value: number | null
        }
        Insert: {
          attempts?: number
          client_id: string
          created_at?: string
          currency?: string | null
          event_id: string
          event_name: string
          id?: string
          lead_id: string
          platform: string
          response?: Json | null
          sent_at?: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          status?: string
          value?: number | null
        }
        Update: {
          attempts?: number
          client_id?: string
          created_at?: string
          currency?: string | null
          event_id?: string
          event_name?: string
          id?: string
          lead_id?: string
          platform?: string
          response?: Json | null
          sent_at?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          status?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_jobs: {
        Row: {
          agency_id: string | null
          client_id: string | null
          created_at: string
          details: Json
          error_message: string | null
          finished_at: string | null
          id: string
          job_name: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_jobs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_id: string | null
          ad_platform: string | null
          attribution_source: string
          campaign_id: string | null
          click_to_message_seconds: number | null
          client_id: string | null
          created_at: string
          ctwa_clid: string | null
          fbclid: string | null
          first_message: string
          id: string
          is_real: boolean
          is_repeat_lead: boolean
          message_received_at: string | null
          order_currency: string | null
          order_value: number | null
          quality_score: number
          quality_signals: Json
          referral_headline: string | null
          sender_phone_hash: string
          source_id: string | null
          source_type: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          stage_confidence: number | null
          stage_evidence: string | null
          stage_suggestion: Database["public"]["Enums"]["lead_stage"] | null
          stage_updated_at: string | null
          status: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          ttclid: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          ad_id?: string | null
          ad_platform?: string | null
          attribution_source?: string
          campaign_id?: string | null
          click_to_message_seconds?: number | null
          client_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          fbclid?: string | null
          first_message: string
          id?: string
          is_real?: boolean
          is_repeat_lead?: boolean
          message_received_at?: string | null
          order_currency?: string | null
          order_value?: number | null
          quality_score?: number
          quality_signals?: Json
          referral_headline?: string | null
          sender_phone_hash: string
          source_id?: string | null
          source_type?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stage_confidence?: number | null
          stage_evidence?: string | null
          stage_suggestion?: Database["public"]["Enums"]["lead_stage"] | null
          stage_updated_at?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          ttclid?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          ad_id?: string | null
          ad_platform?: string | null
          attribution_source?: string
          campaign_id?: string | null
          click_to_message_seconds?: number | null
          client_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          fbclid?: string | null
          first_message?: string
          id?: string
          is_real?: boolean
          is_repeat_lead?: boolean
          message_received_at?: string | null
          order_currency?: string | null
          order_value?: number | null
          quality_score?: number
          quality_signals?: Json
          referral_headline?: string | null
          sender_phone_hash?: string
          source_id?: string | null
          source_type?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stage_confidence?: number | null
          stage_evidence?: string | null
          stage_suggestion?: Database["public"]["Enums"]["lead_stage"] | null
          stage_updated_at?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id?: string
          ttclid?: string | null
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author: string
          client_id: string
          conversation_id: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          text: string | null
        }
        Insert: {
          author: string
          client_id: string
          conversation_id: string
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          text?: string | null
        }
        Update: {
          author?: string
          client_id?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_accounts: {
        Row: {
          ad_account_id: string | null
          ad_account_name: string | null
          ads_token: string | null
          capi_token: string | null
          client_id: string
          created_at: string
          dataset_id: string | null
          dataset_name: string | null
          id: string
          tenant_id: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_name?: string | null
          ads_token?: string | null
          capi_token?: string | null
          client_id: string
          created_at?: string
          dataset_id?: string | null
          dataset_name?: string | null
          id?: string
          tenant_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string | null
          ad_account_name?: string | null
          ads_token?: string | null
          capi_token?: string | null
          client_id?: string
          created_at?: string
          dataset_id?: string | null
          dataset_name?: string | null
          id?: string
          tenant_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          campaign_id: string
          campaign_name: string | null
          clicks: number
          client_id: string
          id: string
          impressions: number
          meta_account_id: string | null
          spend: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_name?: string | null
          clicks?: number
          client_id: string
          id?: string
          impressions?: number
          meta_account_id?: string | null
          spend?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number
          client_id?: string
          id?: string
          impressions?: number
          meta_account_id?: string | null
          spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_campaigns_meta_account_id_fkey"
            columns: ["meta_account_id"]
            isOneToOne: false
            referencedRelation: "meta_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          campaign_alerts: boolean
          daily_summary: boolean
          new_verified: boolean
          number_status: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_alerts?: boolean
          daily_summary?: boolean
          new_verified?: boolean
          number_status?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_alerts?: boolean
          daily_summary?: boolean
          new_verified?: boolean
          number_status?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          agency_id: string
          body: string | null
          client_id: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          agency_id: string
          body?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          agency_id?: string
          body?: string | null
          client_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          client_id: string
          created_at: string
          currency: string
          description: string | null
          id: string
          images: string[]
          in_stock: boolean
          name: string
          price: number | null
          videos: string[]
        }
        Insert: {
          client_id: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          images?: string[]
          in_stock?: boolean
          name: string
          price?: number | null
          videos?: string[]
        }
        Update: {
          client_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          images?: string[]
          in_stock?: boolean
          name?: string
          price?: number | null
          videos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduler_config: {
        Row: {
          created_at: string
          cron_token: string
          id: number
        }
        Insert: {
          created_at?: string
          cron_token?: string
          id?: number
        }
        Update: {
          created_at?: string
          cron_token?: string
          id?: number
        }
        Relationships: []
      }
      tiktok_accounts: {
        Row: {
          access_token: string
          advertiser_id: string
          advertiser_name: string | null
          client_id: string | null
          connected_at: string
          id: string
          refresh_token: string | null
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          advertiser_id: string
          advertiser_name?: string | null
          client_id?: string | null
          connected_at?: string
          id?: string
          refresh_token?: string | null
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          advertiser_id?: string
          advertiser_name?: string | null
          client_id?: string | null
          connected_at?: string
          id?: string
          refresh_token?: string | null
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_campaigns: {
        Row: {
          campaign_id: string
          campaign_name: string
          clicks: number | null
          client_id: string | null
          created_at: string
          id: string
          impressions: number | null
          real_conversations: number | null
          spend: number | null
          tenant_id: string
          tiktok_account_id: string | null
          trash_conversations: number | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_name: string
          clicks?: number | null
          client_id?: string | null
          created_at?: string
          id?: string
          impressions?: number | null
          real_conversations?: number | null
          spend?: number | null
          tenant_id: string
          tiktok_account_id?: string | null
          trash_conversations?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number | null
          client_id?: string | null
          created_at?: string
          id?: string
          impressions?: number | null
          real_conversations?: number | null
          spend?: number | null
          tenant_id?: string
          tiktok_account_id?: string | null
          trash_conversations?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_campaigns_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_pixels: {
        Row: {
          client_id: string
          created_at: string
          id: string
          pixel_code: string
          pixel_name: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          pixel_code: string
          pixel_name?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          pixel_code?: string
          pixel_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_pixels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_numbers: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          phone_number: string
          phone_number_id: string
          status: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id: string
          updated_at: string
          waba_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          phone_number: string
          phone_number_id: string
          status?: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id: string
          updated_at?: string
          waba_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          phone_number?: string
          phone_number_id?: string
          status?: Database["public"]["Enums"]["whatsapp_status"]
          tenant_id?: string
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_numbers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_agency_members: {
        Args: { _agency_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          member_id: string
          role: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }[]
      }
      get_user_agency_id: { Args: { _user_id: string }; Returns: string }
      has_agency_role: {
        Args: {
          _agency_id: string
          _role: Database["public"]["Enums"]["agency_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_agency: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "individual" | "agency"
      agency_role: "owner" | "admin" | "viewer"
      lead_stage: "new" | "real" | "qualified" | "client" | "not_lead"
      lead_status: "verified" | "pending" | "trash"
      whatsapp_status: "connected" | "disconnected" | "pending"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["individual", "agency"],
      agency_role: ["owner", "admin", "viewer"],
      lead_stage: ["new", "real", "qualified", "client", "not_lead"],
      lead_status: ["verified", "pending", "trash"],
      whatsapp_status: ["connected", "disconnected", "pending"],
    },
  },
} as const
