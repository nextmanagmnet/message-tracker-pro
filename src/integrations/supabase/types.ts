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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ad_account_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          advertiser_id: string
          advertiser_name: string | null
          agency_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          note: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          advertiser_id: string
          advertiser_name?: string | null
          agency_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          advertiser_id?: string
          advertiser_name?: string | null
          agency_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_invites_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_clicks: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: number
          to_number: string | null
          ttclid: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          to_number?: string | null
          ttclid?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          to_number?: string | null
          ttclid?: string | null
        }
        Relationships: []
      }
      ad_launches: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          params: Json
          status: string
          tiktok_ad_ids: string[]
          tiktok_adgroup_id: string | null
          tiktok_campaign_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          params?: Json
          status?: string
          tiktok_ad_ids?: string[]
          tiktok_adgroup_id?: string | null
          tiktok_campaign_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          params?: Json
          status?: string
          tiktok_ad_ids?: string[]
          tiktok_adgroup_id?: string | null
          tiktok_campaign_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_launches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_media: {
        Row: {
          client_id: string
          created_at: string
          error: string | null
          file_name: string | null
          id: string
          kind: string
          status: string
          storage_path: string | null
          tiktok_image_id: string | null
          tiktok_video_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          error?: string | null
          file_name?: string | null
          id?: string
          kind: string
          status?: string
          storage_path?: string | null
          tiktok_image_id?: string | null
          tiktok_video_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          error?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          status?: string
          storage_path?: string | null
          tiktok_image_id?: string | null
          tiktok_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_media_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_recommendations: {
        Row: {
          action: Json
          client_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          level: string
          platform: string
          rationale: string
          result: Json | null
          status: string
          target_id: string
          title: string
        }
        Insert: {
          action?: Json
          client_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          level: string
          platform?: string
          rationale: string
          result?: Json | null
          status?: string
          target_id: string
          title: string
        }
        Update: {
          action?: Json
          client_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          level?: string
          platform?: string
          rationale?: string
          result?: Json | null
          status?: string
          target_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_recommendations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
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
      agency_client_links: {
        Row: {
          advertiser_id: string
          advertiser_name: string | null
          agency_id: string
          agency_name: string
          can_run_ads: boolean
          client_id: string
          id: string
          invite_id: string | null
          linked_at: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
        }
        Insert: {
          advertiser_id: string
          advertiser_name?: string | null
          agency_id: string
          agency_name: string
          client_id: string
          id?: string
          invite_id?: string | null
          linked_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
        }
        Update: {
          advertiser_id?: string
          advertiser_name?: string | null
          agency_id?: string
          agency_name?: string
          can_run_ads?: boolean
          client_id?: string
          id?: string
          invite_id?: string | null
          linked_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_links_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_links_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "ad_account_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_payments: {
        Row: {
          agency_id: string
          amount: number
          client_id: string
          client_name: string | null
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          entry_id: string | null
          id: string
          note: string | null
          recorded_by: string
          reference: string
          status: string
        }
        Insert: {
          agency_id: string
          amount: number
          client_id: string
          client_name?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          entry_id?: string | null
          id?: string
          note?: string | null
          recorded_by: string
          reference: string
          status?: string
        }
        Update: {
          status?: string
        }
        Relationships: []
      }
      agency_limits: {
        Row: {
          agency_id: string
          max_daily_transfer: number
          payment_approval_over: number
          payment_daily_cap: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agency_id: string
          max_daily_transfer?: number
          payment_approval_over?: number
          payment_daily_cap?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          max_daily_transfer?: number
          payment_approval_over?: number
          payment_daily_cap?: number
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agency_id: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          permissions: string[]
          role: Database["public"]["Enums"]["agency_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id: string
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          permissions?: string[]
          role: Database["public"]["Enums"]["agency_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          permissions?: string[]
          role?: Database["public"]["Enums"]["agency_role"]
        }
        Relationships: []
      }
      agency_members: {
        Row: {
          agency_id: string
          client_id: string | null
          created_at: string
          id: string
          permissions: string[] | null
          role: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }
        Insert: {
          agency_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          permissions?: string[] | null
          role?: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }
        Update: {
          agency_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          permissions?: string[] | null
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
          {
            foreignKeyName: "agency_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_wallet_settings: {
        Row: {
          agency_id: string
          commission_percent: number
          flat_fee: number
          min_topup: number
          payment_instructions: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          commission_percent?: number
          flat_fee?: number
          min_topup?: number
          payment_instructions?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          commission_percent?: number
          flat_fee?: number
          min_topup?: number
          payment_instructions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_wallet_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
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
          tone_profile: string | null
          tone_sample_size: number | null
          tone_updated_at: string | null
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
          tone_profile?: string | null
          tone_sample_size?: number | null
          tone_updated_at?: string | null
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
          tone_profile?: string | null
          tone_sample_size?: number | null
          tone_updated_at?: string | null
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
      bc_accounts: {
        Row: {
          advertiser_id: string
          advertiser_name: string | null
          agency_id: string
          bc_id: string
          bc_name: string | null
          updated_at: string
        }
        Insert: {
          advertiser_id: string
          advertiser_name?: string | null
          agency_id: string
          bc_id: string
          bc_name?: string | null
          updated_at?: string
        }
        Update: {
          advertiser_id?: string
          advertiser_name?: string | null
          agency_id?: string
          bc_id?: string
          bc_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_accounts_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_connections: {
        Row: {
          access_token: string
          agency_id: string
          bc_id: string | null
          bc_name: string | null
          connected_at: string
          connected_by: string | null
          id: string
          max_transfer: number
          refresh_token: string | null
          token_expires_at: string | null
        }
        Insert: {
          access_token: string
          agency_id: string
          bc_id?: string | null
          bc_name?: string | null
          connected_at?: string
          connected_by?: string | null
          id?: string
          max_transfer?: number
          refresh_token?: string | null
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string
          agency_id?: string
          bc_id?: string | null
          bc_name?: string | null
          connected_at?: string
          connected_by?: string | null
          id?: string
          max_transfer?: number
          refresh_token?: string | null
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bc_connections_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agency_id: string
          client_id: string
          created_at: string
          created_by: string | null
          email: string
          id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invites_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_id: string
          created_at: string
          default_order_currency: string | null
          default_order_value: number | null
          delivery_marker: string
          id: string
          name: string
          order_marker: string
          purchase_trigger: string
          return_marker: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          default_order_currency?: string | null
          default_order_value?: number | null
          delivery_marker?: string
          id?: string
          name: string
          order_marker?: string
          purchase_trigger?: string
          return_marker?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          default_order_currency?: string | null
          default_order_value?: number | null
          delivery_marker?: string
          id?: string
          name?: string
          order_marker?: string
          purchase_trigger?: string
          return_marker?: string
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
          assigned_at: string | null
          assigned_to: string | null
          client_id: string
          created_at: string
          first_reply_at: string | null
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
          assigned_at?: string | null
          assigned_to?: string | null
          client_id: string
          created_at?: string
          first_reply_at?: string | null
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
          assigned_at?: string | null
          assigned_to?: string | null
          client_id?: string
          created_at?: string
          first_reply_at?: string | null
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
      fund_transfers: {
        Row: {
          advertiser_id: string
          advertiser_name: string | null
          agency_id: string
          amount: number
          bc_id: string | null
          bc_name: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          request_id: string
          response: Json | null
          status: string
          type: string
        }
        Insert: {
          advertiser_id: string
          advertiser_name?: string | null
          agency_id: string
          amount: number
          bc_id?: string | null
          bc_name?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          request_id?: string
          response?: Json | null
          status?: string
          type?: string
        }
        Update: {
          advertiser_id?: string
          advertiser_name?: string | null
          agency_id?: string
          amount?: number
          bc_id?: string | null
          bc_name?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          request_id?: string
          response?: Json | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_transfers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_transfers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          delivered_at: string | null
          fbclid: string | null
          first_message: string
          id: string
          is_real: boolean
          is_repeat_lead: boolean
          message_received_at: string | null
          order_confirmed_at: string | null
          order_currency: string | null
          order_status: string | null
          order_value: number | null
          quality_score: number
          quality_signals: Json
          referral_headline: string | null
          returned_at: string | null
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
          delivered_at?: string | null
          fbclid?: string | null
          first_message: string
          id?: string
          is_real?: boolean
          is_repeat_lead?: boolean
          message_received_at?: string | null
          order_confirmed_at?: string | null
          order_currency?: string | null
          order_status?: string | null
          order_value?: number | null
          quality_score?: number
          quality_signals?: Json
          referral_headline?: string | null
          returned_at?: string | null
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
          delivered_at?: string | null
          fbclid?: string | null
          first_message?: string
          id?: string
          is_real?: boolean
          is_repeat_lead?: boolean
          message_received_at?: string | null
          order_confirmed_at?: string | null
          order_currency?: string | null
          order_status?: string | null
          order_value?: number | null
          quality_score?: number
          quality_signals?: Json
          referral_headline?: string | null
          returned_at?: string | null
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
          managed_by_agency_id: string | null
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
          managed_by_agency_id?: string | null
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
          managed_by_agency_id?: string | null
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
          {
            foreignKeyName: "tiktok_accounts_managed_by_agency_id_fkey"
            columns: ["managed_by_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_audiences: {
        Row: {
          client_id: string
          created_at: string
          error: string | null
          id: string
          last_synced_at: string | null
          member_count: number | null
          name: string
          source: string
          status: string
          tiktok_audience_id: string | null
          tiktok_lookalike_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          error?: string | null
          id?: string
          last_synced_at?: string | null
          member_count?: number | null
          name: string
          source: string
          status?: string
          tiktok_audience_id?: string | null
          tiktok_lookalike_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          error?: string | null
          id?: string
          last_synced_at?: string | null
          member_count?: number | null
          name?: string
          source?: string
          status?: string
          tiktok_audience_id?: string | null
          tiktok_lookalike_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_audiences_client_id_fkey"
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
      topup_requests: {
        Row: {
          advertiser_id: string
          advertiser_name: string | null
          amount: number
          client_id: string
          client_name: string | null
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          error: string | null
          fee: number
          fund_transfer_id: string | null
          funding_agency_id: string
          id: string
          note: string | null
          refund_entry_id: string | null
          requested_by: string | null
          status: string
          wallet_entry_id: string | null
        }
        Insert: {
          advertiser_id: string
          advertiser_name?: string | null
          amount: number
          client_id: string
          client_name?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          fee?: number
          fund_transfer_id?: string | null
          funding_agency_id: string
          id?: string
          note?: string | null
          refund_entry_id?: string | null
          requested_by?: string | null
          status?: string
          wallet_entry_id?: string | null
        }
        Update: {
          advertiser_id?: string
          advertiser_name?: string | null
          amount?: number
          client_id?: string
          client_name?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          fee?: number
          fund_transfer_id?: string | null
          funding_agency_id?: string
          id?: string
          note?: string | null
          refund_entry_id?: string | null
          requested_by?: string | null
          status?: string
          wallet_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topup_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_requests_fund_transfer_id_fkey"
            columns: ["fund_transfer_id"]
            isOneToOne: false
            referencedRelation: "fund_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_requests_funding_agency_id_fkey"
            columns: ["funding_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_requests_refund_entry_id_fkey"
            columns: ["refund_entry_id"]
            isOneToOne: false
            referencedRelation: "wallet_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_requests_wallet_entry_id_fkey"
            columns: ["wallet_entry_id"]
            isOneToOne: false
            referencedRelation: "wallet_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_entries: {
        Row: {
          amount: number
          balance_after: number
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          provider: string | null
          provider_ref: string | null
          request_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          provider?: string | null
          provider_ref?: string | null
          request_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          provider?: string | null
          provider_ref?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_entries_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "topup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          client_id: string
          currency: string
          reference_code: string
          updated_at: string
        }
        Insert: {
          balance?: number
          client_id: string
          currency?: string
          reference_code?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          client_id?: string
          currency?: string
          reference_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_settings: {
        Row: {
          client_id: string
          enabled: boolean
          hour: number
          language: string
          last_sent_at: string | null
          phone: string | null
          timezone: string
          updated_at: string
          weekday: number
        }
        Insert: {
          client_id: string
          enabled?: boolean
          hour?: number
          language?: string
          last_sent_at?: string | null
          phone?: string | null
          timezone?: string
          updated_at?: string
          weekday?: number
        }
        Update: {
          client_id?: string
          enabled?: boolean
          hour?: number
          language?: string
          last_sent_at?: string | null
          phone?: string | null
          timezone?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
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
      accept_agency_invite: {
        Args: {
          p_agency_token: string
          p_client: string
          p_hash: string
          p_user: string
        }
        Returns: string
      }
      accept_client_invite: { Args: never; Returns: string }
      accept_team_invite: { Args: never; Returns: string }
      agency_can_run_ads: {
        Args: { p_client: string; p_user: string }
        Returns: boolean
      }
      set_link_run_ads: {
        Args: { p_allow: boolean; p_client: string }
        Returns: undefined
      }
      agency_client_campaigns: {
        Args: { p_agency: string; p_client: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          chats: number
          clicks: number
          impressions: number
          orders: number
          qualified: number
          real_chats: number
          revenue: number
          spend: number
        }[]
      }
      agency_client_metrics: {
        Args: { p_agency: string }
        Returns: {
          advertiser_id: string
          advertiser_name: string
          chats: number
          clicks: number
          client_id: string
          currency: string
          impressions: number
          last_synced: string
          link_id: string
          linked_at: string
          orders: number
          qualified: number
          real_chats: number
          revenue: number
          spend: number
        }[]
      }
      auth_user_by_email: {
        Args: { _email: string }
        Returns: {
          id: string
          last_sign_in_at: string
        }[]
      }
      create_topup_request: {
        Args: {
          p_advertiser: string
          p_advertiser_name: string
          p_agency: string
          p_amount: number
          p_by: string
          p_client: string
          p_client_name: string
          p_currency: string
          p_note: string
        }
        Returns: string
      }
      end_agency_link: {
        Args: { p_by: string; p_link: string }
        Returns: undefined
      }
      get_agency_members: {
        Args: { _agency_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          member_id: string
          permissions: string[] | null
          role: Database["public"]["Enums"]["agency_role"]
          user_id: string
        }[]
      }
      get_user_agency_id: { Args: { _user_id: string }; Returns: string }
      has_agency_permission: {
        Args: { _agency_id: string; _perm: string; _user_id: string }
        Returns: boolean
      }
      has_agency_role: {
        Args: {
          _agency_id: string
          _role: Database["public"]["Enums"]["agency_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_client_user_of: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      record_ad_click: {
        Args: { p_campaign_id: string; p_to: string; p_ttclid: string }
        Returns: number
      }
      settle_topup_request: {
        Args: { p_by: string; p_outcome: string; p_request: string }
        Returns: string
      }
      topup_fee: {
        Args: { p_agency: string; p_amount: number }
        Returns: number
      }
      user_can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_agency: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      wallet_apply: {
        Args: {
          p_amount: number
          p_by: string
          p_client: string
          p_kind: string
          p_note: string
          p_provider: string
          p_provider_ref: string
          p_request: string
        }
        Returns: {
          out_balance: number
          out_duplicate: boolean
        }[]
      }
    }
    Enums: {
      account_type: "individual" | "agency"
      agency_role: "owner" | "admin" | "viewer" | "client"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["individual", "agency"],
      agency_role: ["owner", "admin", "viewer", "client"],
      lead_stage: ["new", "real", "qualified", "client", "not_lead"],
      lead_status: ["verified", "pending", "trash"],
      whatsapp_status: ["connected", "disconnected", "pending"],
    },
  },
} as const
