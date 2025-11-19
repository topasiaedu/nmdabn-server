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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      contacts: {
        Row: {
          address: string | null
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          industry: string | null
          job_title: string | null
          last_name: string | null
          metadata: Json | null
          phone: string | null
          state: string | null
          timezone: string | null
          updated_at: string
          workspace_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_name?: string | null
          metadata?: Json | null
          phone?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string
          workspace_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_name?: string | null
          metadata?: Json | null
          phone?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string
          workspace_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_sheets_syncs: {
        Row: {
          created_at: string
          id: string
          integration_account_id: string | null
          is_active: boolean
          last_synced_at: string | null
          mapping_config: Json | null
          sheet_name: string | null
          spreadsheet_id: string
          sync_error: string | null
          sync_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_account_id?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          mapping_config?: Json | null
          sheet_name?: string | null
          spreadsheet_id: string
          sync_error?: string | null
          sync_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_account_id?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          mapping_config?: Json | null
          sheet_name?: string | null
          spreadsheet_id?: string
          sync_error?: string | null
          sync_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_sheets_syncs_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_sheets_syncs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          api_key: string | null
          api_secret: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          display_name: string | null
          expires_at: string | null
          extra: Json | null
          id: string
          is_default: boolean
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          api_key?: string | null
          api_secret?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          extra?: Json | null
          id?: string
          is_default?: boolean
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          api_key?: string | null
          api_secret?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          extra?: Json | null
          id?: string
          is_default?: boolean
          provider?: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          integration_account_id: string | null
          last_error: string | null
          operation: string
          payload: Json
          provider: Database["public"]["Enums"]["integration_provider"]
          run_at: string | null
          status: Database["public"]["Enums"]["integration_job_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          integration_account_id?: string | null
          last_error?: string | null
          operation: string
          payload: Json
          provider: Database["public"]["Enums"]["integration_provider"]
          run_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          integration_account_id?: string | null
          last_error?: string | null
          operation?: string
          payload?: Json
          provider?: Database["public"]["Enums"]["integration_provider"]
          run_at?: string | null
          status?: Database["public"]["Enums"]["integration_job_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_jobs_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      zoom_analytics_metadata: {
        Row: {
          created_at: string
          data: Json
          data_type: string
          id: string
          meeting_id: string | null
          metadata_type: string
          updated_at: string
          webinar_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          data_type: string
          id?: string
          meeting_id?: string | null
          metadata_type: string
          updated_at?: string
          webinar_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          data_type?: string
          id?: string
          meeting_id?: string | null
          metadata_type?: string
          updated_at?: string
          webinar_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_analytics_metadata_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "zoom_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_analytics_metadata_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "zoom_webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_analytics_metadata_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_attendees: {
        Row: {
          attendee_type: string
          attentiveness_score: number | null
          contact_id: string | null
          created_at: string
          device: string | null
          duration: number | null
          email: string | null
          id: string
          ip_address: string | null
          join_time: string | null
          leave_time: string | null
          location: string | null
          meeting_id: string | null
          metadata: Json | null
          name: string | null
          network_type: string | null
          participant_id: string | null
          updated_at: string
          user_id: string | null
          user_role: string | null
          webinar_id: string | null
          workspace_id: string
        }
        Insert: {
          attendee_type: string
          attentiveness_score?: number | null
          contact_id?: string | null
          created_at?: string
          device?: string | null
          duration?: number | null
          email?: string | null
          id?: string
          ip_address?: string | null
          join_time?: string | null
          leave_time?: string | null
          location?: string | null
          meeting_id?: string | null
          metadata?: Json | null
          name?: string | null
          network_type?: string | null
          participant_id?: string | null
          updated_at?: string
          user_id?: string | null
          user_role?: string | null
          webinar_id?: string | null
          workspace_id: string
        }
        Update: {
          attendee_type?: string
          attentiveness_score?: number | null
          contact_id?: string | null
          created_at?: string
          device?: string | null
          duration?: number | null
          email?: string | null
          id?: string
          ip_address?: string | null
          join_time?: string | null
          leave_time?: string | null
          location?: string | null
          meeting_id?: string | null
          metadata?: Json | null
          name?: string | null
          network_type?: string | null
          participant_id?: string | null
          updated_at?: string
          user_id?: string | null
          user_role?: string | null
          webinar_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_attendees_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "zoom_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_attendees_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "zoom_webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_attendees_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_meetings: {
        Row: {
          created_at: string
          duration: number | null
          host_email: string | null
          host_id: string | null
          id: string
          integration_account_id: string | null
          is_synced: boolean | null
          join_url: string | null
          last_synced_at: string | null
          meeting_id: string
          settings: Json | null
          start_time: string | null
          start_url: string | null
          status: string | null
          sync_error: string | null
          timezone: string | null
          topic: string | null
          type: number | null
          updated_at: string
          uuid: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration?: number | null
          host_email?: string | null
          host_id?: string | null
          id?: string
          integration_account_id?: string | null
          is_synced?: boolean | null
          join_url?: string | null
          last_synced_at?: string | null
          meeting_id: string
          settings?: Json | null
          start_time?: string | null
          start_url?: string | null
          status?: string | null
          sync_error?: string | null
          timezone?: string | null
          topic?: string | null
          type?: number | null
          updated_at?: string
          uuid?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration?: number | null
          host_email?: string | null
          host_id?: string | null
          id?: string
          integration_account_id?: string | null
          is_synced?: boolean | null
          join_url?: string | null
          last_synced_at?: string | null
          meeting_id?: string
          settings?: Json | null
          start_time?: string | null
          start_url?: string | null
          status?: string | null
          sync_error?: string | null
          timezone?: string | null
          topic?: string | null
          type?: number | null
          updated_at?: string
          uuid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_meetings_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_recordings: {
        Row: {
          created_at: string
          download_url: string | null
          file_extension: string | null
          file_size: number | null
          file_type: string | null
          id: string
          meeting_id: string | null
          metadata: Json | null
          play_url: string | null
          recording_end: string | null
          recording_id: string | null
          recording_start: string | null
          recording_type: string
          recording_type_detail: string | null
          status: string | null
          updated_at: string
          uuid: string | null
          webinar_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          download_url?: string | null
          file_extension?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          meeting_id?: string | null
          metadata?: Json | null
          play_url?: string | null
          recording_end?: string | null
          recording_id?: string | null
          recording_start?: string | null
          recording_type: string
          recording_type_detail?: string | null
          status?: string | null
          updated_at?: string
          uuid?: string | null
          webinar_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          download_url?: string | null
          file_extension?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          meeting_id?: string | null
          metadata?: Json | null
          play_url?: string | null
          recording_end?: string | null
          recording_id?: string | null
          recording_start?: string | null
          recording_type?: string
          recording_type_detail?: string | null
          status?: string | null
          updated_at?: string
          uuid?: string | null
          webinar_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_recordings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "zoom_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_recordings_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "zoom_webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_recordings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_registrants: {
        Row: {
          address: string | null
          city: string | null
          contact_id: string | null
          country: string | null
          created_at: string
          custom_questions: Json | null
          email: string
          first_name: string | null
          id: string
          industry: string | null
          job_title: string | null
          join_url: string | null
          last_name: string | null
          meeting_id: string | null
          org: string | null
          phone: string | null
          registrant_id: string | null
          registrant_type: string
          registration_time: string | null
          state: string | null
          status: string | null
          updated_at: string
          webinar_id: string | null
          workspace_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          custom_questions?: Json | null
          email: string
          first_name?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          join_url?: string | null
          last_name?: string | null
          meeting_id?: string | null
          org?: string | null
          phone?: string | null
          registrant_id?: string | null
          registrant_type: string
          registration_time?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          webinar_id?: string | null
          workspace_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          custom_questions?: Json | null
          email?: string
          first_name?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          join_url?: string | null
          last_name?: string | null
          meeting_id?: string | null
          org?: string | null
          phone?: string | null
          registrant_id?: string | null
          registrant_type?: string
          registration_time?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          webinar_id?: string | null
          workspace_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoom_registrants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_registrants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "zoom_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_registrants_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "zoom_webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_registrants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_transcriptions: {
        Row: {
          created_at: string
          id: string
          language: string | null
          meeting_id: string | null
          status: string | null
          structured_transcript: Json | null
          transcript_text: string | null
          transcript_url: string | null
          transcription_type: string
          updated_at: string
          webinar_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          meeting_id?: string | null
          status?: string | null
          structured_transcript?: Json | null
          transcript_text?: string | null
          transcript_url?: string | null
          transcription_type: string
          updated_at?: string
          webinar_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          meeting_id?: string | null
          status?: string | null
          structured_transcript?: Json | null
          transcript_text?: string | null
          transcript_url?: string | null
          transcription_type?: string
          updated_at?: string
          webinar_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_transcriptions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "zoom_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_transcriptions_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "zoom_webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_transcriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_webinars: {
        Row: {
          approval_type: number | null
          created_at: string
          duration: number | null
          host_email: string | null
          host_id: string | null
          id: string
          integration_account_id: string | null
          is_synced: boolean | null
          join_url: string | null
          last_synced_at: string | null
          registration_url: string | null
          settings: Json | null
          start_time: string | null
          status: string | null
          sync_error: string | null
          timezone: string | null
          topic: string | null
          type: number | null
          updated_at: string
          uuid: string | null
          webinar_id: string
          workspace_id: string
        }
        Insert: {
          approval_type?: number | null
          created_at?: string
          duration?: number | null
          host_email?: string | null
          host_id?: string | null
          id?: string
          integration_account_id?: string | null
          is_synced?: boolean | null
          join_url?: string | null
          last_synced_at?: string | null
          registration_url?: string | null
          settings?: Json | null
          start_time?: string | null
          status?: string | null
          sync_error?: string | null
          timezone?: string | null
          topic?: string | null
          type?: number | null
          updated_at?: string
          uuid?: string | null
          webinar_id: string
          workspace_id: string
        }
        Update: {
          approval_type?: number | null
          created_at?: string
          duration?: number | null
          host_email?: string | null
          host_id?: string | null
          id?: string
          integration_account_id?: string | null
          is_synced?: boolean | null
          join_url?: string | null
          last_synced_at?: string | null
          registration_url?: string | null
          settings?: Json | null
          start_time?: string | null
          status?: string | null
          sync_error?: string | null
          timezone?: string | null
          topic?: string | null
          type?: number | null
          updated_at?: string
          uuid?: string | null
          webinar_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_webinars_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_webinars_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      integration_job_status: "pending" | "processing" | "done" | "error"
      integration_provider: "zoom" | "vapi" | "google_sheets" | "gohighlevel"
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
  public: {
    Enums: {
      integration_job_status: ["pending", "processing", "done", "error"],
      integration_provider: ["zoom", "vapi", "google_sheets", "gohighlevel"],
    },
  },
} as const
