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
      agent_runs: {
        Row: {
          agent_id: string
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          error: string | null
          id: string
          input: Json | null
          output: Json | null
          owner_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          agent_id: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          owner_id: string
          started_at?: string | null
          status: string
        }
        Update: {
          agent_id?: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          owner_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "halo_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_emails: {
        Row: {
          added_at: string
          added_by: string | null
          email: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          email: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          email?: string
        }
        Relationships: []
      }
      claude_sessions: {
        Row: {
          claude_session_id: string
          created_at: string
          cwd: string
          halo_id: string | null
          hostname: string
          id: string
          last_seen: string
          owner_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          claude_session_id: string
          created_at?: string
          cwd: string
          halo_id?: string | null
          hostname: string
          id?: string
          last_seen?: string
          owner_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          claude_session_id?: string
          created_at?: string
          cwd?: string
          halo_id?: string | null
          hostname?: string
          id?: string
          last_seen?: string
          owner_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claude_sessions_halo_id_fkey"
            columns: ["halo_id"]
            isOneToOne: false
            referencedRelation: "halos"
            referencedColumns: ["id"]
          },
        ]
      }
      filaments: {
        Row: {
          created_at: string
          description: string | null
          from_halo_id: string
          id: string
          kind: string
          strength: string
          to_halo_id: string
          via_junction: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          from_halo_id: string
          id?: string
          kind: string
          strength?: string
          to_halo_id: string
          via_junction?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          from_halo_id?: string
          id?: string
          kind?: string
          strength?: string
          to_halo_id?: string
          via_junction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filaments_from_halo_id_fkey"
            columns: ["from_halo_id"]
            isOneToOne: false
            referencedRelation: "halos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filaments_to_halo_id_fkey"
            columns: ["to_halo_id"]
            isOneToOne: false
            referencedRelation: "halos"
            referencedColumns: ["id"]
          },
        ]
      }
      halo_agents: {
        Row: {
          config: Json
          context_md: string | null
          created_at: string
          description: string | null
          halo_id: string
          id: string
          is_enabled: boolean
          kind: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          context_md?: string | null
          created_at?: string
          description?: string | null
          halo_id: string
          id?: string
          is_enabled?: boolean
          kind: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          context_md?: string | null
          created_at?: string
          description?: string | null
          halo_id?: string
          id?: string
          is_enabled?: boolean
          kind?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "halo_agents_halo_id_fkey"
            columns: ["halo_id"]
            isOneToOne: false
            referencedRelation: "halos"
            referencedColumns: ["id"]
          },
        ]
      }
      halo_integrations: {
        Row: {
          config: Json
          created_at: string
          halo_id: string
          id: string
          owner_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          halo_id: string
          id?: string
          owner_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          halo_id?: string
          id?: string
          owner_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "halo_integrations_halo_id_fkey"
            columns: ["halo_id"]
            isOneToOne: false
            referencedRelation: "halos"
            referencedColumns: ["id"]
          },
        ]
      }
      halos: {
        Row: {
          created_at: string
          description: string
          description_long: string | null
          domain: string
          glyph_type: string
          id: string
          is_public: boolean
          name: string
          position_x: number
          position_y: number
          radius: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          description_long?: string | null
          domain: string
          glyph_type: string
          id: string
          is_public?: boolean
          name: string
          position_x: number
          position_y: number
          radius: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          description_long?: string | null
          domain?: string
          glyph_type?: string
          id?: string
          is_public?: boolean
          name?: string
          position_x?: number
          position_y?: number
          radius?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_messages: {
        Row: {
          content: Json
          id: string
          owner_id: string
          recorded_at: string
          role: string
          sequence: number
          session_id: string
        }
        Insert: {
          content: Json
          id?: string
          owner_id: string
          recorded_at?: string
          role: string
          sequence: number
          session_id: string
        }
        Update: {
          content?: Json
          id?: string
          owner_id?: string
          recorded_at?: string
          role?: string
          sequence?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "claude_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          default_view: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_view?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_view?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
    Enums: {},
  },
} as const
