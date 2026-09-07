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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
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
      clients: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          name?: string
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
      leads: {
        Row: {
          client_id: string | null
          created_at: string
          first_message: string
          id: string
          is_real: boolean
          sender_phone_hash: string
          status: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          ttclid: string | null
          whatsapp_number_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          first_message: string
          id?: string
          is_real?: boolean
          sender_phone_hash: string
          status?: Database["public"]["Enums"]["lead_status"]
          tenant_id: string
          ttclid?: string | null
          whatsapp_number_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          first_message?: string
          id?: string
          is_real?: boolean
          sender_phone_hash?: string
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
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          company_name: string
          created_at: string
          id: string
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: string
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
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
          {
            foreignKeyName: "tiktok_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_campaigns: {
        Row: {
          campaign_id: string
          campaign_name: string
          client_id: string | null
          created_at: string
          id: string
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
          client_id?: string | null
          created_at?: string
          id?: string
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
          client_id?: string | null
          created_at?: string
          id?: string
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
            foreignKeyName: "tiktok_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          {
            foreignKeyName: "whatsapp_numbers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_agency_id: { Args: { _user_id: string }; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_agency_role: {
        Args: {
          _agency_id: string
          _role: Database["public"]["Enums"]["agency_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      user_belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
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
      agency_role: "owner" | "admin" | "viewer"
      app_role: "owner" | "admin" | "member"
      lead_status: "verified" | "pending" | "trash"
      subscription_plan: "free" | "starter" | "pro" | "enterprise"
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
      agency_role: ["owner", "admin", "viewer"],
      app_role: ["owner", "admin", "member"],
      lead_status: ["verified", "pending", "trash"],
      subscription_plan: ["free", "starter", "pro", "enterprise"],
      whatsapp_status: ["connected", "disconnected", "pending"],
    },
  },
} as const
