export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: { key: string; updated_at: string; value: string }
        Insert: { key: string; updated_at?: string; value: string }
        Update: { key?: string; updated_at?: string; value?: string }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          at: string
          detail: Json
          entity: string | null
          entity_id: string | null
          id: number
          location_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          at?: string
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: never
          location_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          at?: string
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: never
          location_id?: string | null
        }
        Relationships: []
      }
      checkins: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          client_id: string | null
          client_name: string | null
          client_rev: number
          created_at: string
          deleted_at: string | null
          device_id: string | null
          id: string
          location_id: string
          payment_action: string | null
          people_entered: number
          room_number: string | null
          session_id: string | null
          updated_at: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          client_id?: string | null
          client_name?: string | null
          client_rev?: number
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          location_id: string
          payment_action?: string | null
          people_entered?: number
          room_number?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          client_id?: string | null
          client_name?: string | null
          client_rev?: number
          created_at?: string
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          location_id?: string
          payment_action?: string | null
          people_entered?: number
          room_number?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          adults: number
          arrival_date: string
          breakfast_included: boolean
          children: number
          client_local_key: string | null
          client_rev: number
          confirmation_number: string
          created_at: string
          deleted_at: string | null
          departure_date: string
          device_id: string | null
          id: string
          is_vip: boolean
          location_id: string
          name: string
          package_code: string | null
          pending_payment_action: string | null
          rate_code: string
          reservation_status: string
          room_number: string
          room_type: string | null
          rtc: string
          session_id: string | null
          updated_at: string
          vip_level: string | null
          vip_notes: string
          vip_source: string | null
        }
        Insert: {
          adults?: number
          arrival_date?: string
          breakfast_included?: boolean
          children?: number
          client_local_key?: string | null
          client_rev?: number
          confirmation_number?: string
          created_at?: string
          deleted_at?: string | null
          departure_date?: string
          device_id?: string | null
          id?: string
          is_vip?: boolean
          location_id: string
          name: string
          package_code?: string | null
          pending_payment_action?: string | null
          rate_code?: string
          reservation_status?: string
          room_number: string
          room_type?: string | null
          rtc?: string
          session_id?: string | null
          updated_at?: string
          vip_level?: string | null
          vip_notes?: string
          vip_source?: string | null
        }
        Update: {
          adults?: number
          arrival_date?: string
          breakfast_included?: boolean
          children?: number
          client_local_key?: string | null
          client_rev?: number
          confirmation_number?: string
          created_at?: string
          deleted_at?: string | null
          departure_date?: string
          device_id?: string | null
          id?: string
          is_vip?: boolean
          location_id?: string
          name?: string
          package_code?: string | null
          pending_payment_action?: string | null
          rate_code?: string
          reservation_status?: string
          room_number?: string
          room_type?: string | null
          rtc?: string
          session_id?: string | null
          updated_at?: string
          vip_level?: string | null
          vip_notes?: string
          vip_source?: string | null
        }
        Relationships: []
      }
      location_codes: {
        Row: {
          active: boolean
          auth_email: string
          auth_user_id: string | null
          code_hash: string
          created_at: string
          id: string
          label: string | null
          last_used_at: string | null
          location_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          active?: boolean
          auth_email: string
          auth_user_id?: string | null
          code_hash: string
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          location_id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          active?: boolean
          auth_email?: string
          auth_user_id?: string | null
          code_hash?: string
          created_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          location_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      location_members: {
        Row: {
          created_at: string
          label: string | null
          location_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          label?: string | null
          location_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          label?: string | null
          location_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          region: string
          settings: Json
          slug: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          region?: string
          settings?: Json
          slug?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          region?: string
          settings?: Json
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      morning_briefs: {
        Row: {
          brief_date: string
          created_at: string
          id: string
          location_id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          brief_date: string
          created_at?: string
          id?: string
          location_id: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          brief_date?: string
          created_at?: string
          id?: string
          location_id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          author_role: Database["public"]["Enums"]["app_role"] | null
          author_user_id: string | null
          body: string
          client_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          location_id: string
          pinned: boolean
          room_number: string | null
          updated_at: string
        }
        Insert: {
          author_role?: Database["public"]["Enums"]["app_role"] | null
          author_user_id?: string | null
          body: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          location_id: string
          pinned?: boolean
          room_number?: string | null
          updated_at?: string
        }
        Update: {
          author_role?: Database["public"]["Enums"]["app_role"] | null
          author_user_id?: string | null
          body?: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          location_id?: string
          pinned?: boolean
          room_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          client_rev: number
          closed_at: string | null
          report_requested_at: string | null
          deleted_at: string | null
          device_id: string | null
          id: string
          location_id: string
          opened_at: string
          raw_upload_text: string | null
          service_date: string
          status: string
          totals: Json
          updated_at: string
        }
        Insert: {
          client_rev?: number
          closed_at?: string | null
          report_requested_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          location_id: string
          opened_at?: string
          raw_upload_text?: string | null
          service_date: string
          status?: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          client_rev?: number
          closed_at?: string | null
          report_requested_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          location_id?: string
          opened_at?: string
          raw_upload_text?: string | null
          service_date?: string
          status?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      auth_location_id: { Args: never; Returns: string }
      auth_user_role: { Args: never; Returns: Database["public"]["Enums"]["app_role"] }
      is_manager: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "manager" | "staff"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["manager", "staff"],
    },
  },
} as const
