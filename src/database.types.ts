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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ghl_connections: {
        Row: {
          created_at: string
          ghl_location_id: string
          id: string
          is_active: boolean
          private_integration_token_encrypted: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ghl_location_id: string
          id?: string
          is_active?: boolean
          private_integration_token_encrypted: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ghl_location_id?: string
          id?: string
          is_active?: boolean
          private_integration_token_encrypted?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_connections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_additional_emails: {
        Row: {
          contact_id: string
          email: string
          location_id: string
          synced_at: string
        }
        Insert: {
          contact_id: string
          email: string
          location_id: string
          synced_at?: string
        }
        Update: {
          contact_id?: string
          email?: string
          location_id?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_additional_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_appointments: {
        Row: {
          appt_status: string | null
          appt_title: string | null
          calendar_id: string | null
          contact_id: string
          end_time: string | null
          id: string
          raw_json: Json
          start_time: string | null
          synced_at: string
        }
        Insert: {
          appt_status?: string | null
          appt_title?: string | null
          calendar_id?: string | null
          contact_id: string
          end_time?: string | null
          id: string
          raw_json?: Json
          start_time?: string | null
          synced_at?: string
        }
        Update: {
          appt_status?: string | null
          appt_title?: string | null
          calendar_id?: string | null
          contact_id?: string
          end_time?: string | null
          id?: string
          raw_json?: Json
          start_time?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_attributions: {
        Row: {
          attribution_extras: Json
          contact_id: string
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          id: number
          ip: string | null
          is_first: boolean | null
          is_last: boolean | null
          location_id: string
          medium: string | null
          medium_id: string | null
          page_url: string | null
          position: number
          referrer: string | null
          synced_at: string
          url: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_session_source: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          attribution_extras?: Json
          contact_id: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: number
          ip?: string | null
          is_first?: boolean | null
          is_last?: boolean | null
          location_id: string
          medium?: string | null
          medium_id?: string | null
          page_url?: string | null
          position: number
          referrer?: string | null
          synced_at?: string
          url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_session_source?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          attribution_extras?: Json
          contact_id?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: number
          ip?: string | null
          is_first?: boolean | null
          is_last?: boolean | null
          location_id?: string
          medium?: string | null
          medium_id?: string | null
          page_url?: string | null
          position?: number
          referrer?: string | null
          synced_at?: string
          url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_session_source?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_attributions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_custom_field_values: {
        Row: {
          contact_id: string
          field_id: string
          field_value: string | null
          location_id: string
          synced_at: string
        }
        Insert: {
          contact_id: string
          field_id: string
          field_value?: string | null
          location_id: string
          synced_at?: string
        }
        Update: {
          contact_id?: string
          field_id?: string
          field_value?: string | null
          location_id?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_custom_field_values_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_followers: {
        Row: {
          contact_id: string
          follower_user_id: string
          location_id: string
          synced_at: string
        }
        Insert: {
          contact_id: string
          follower_user_id: string
          location_id: string
          synced_at?: string
        }
        Update: {
          contact_id?: string
          follower_user_id?: string
          location_id?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_followers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_notes: {
        Row: {
          contact_id: string
          id: string
          note_body: string | null
          note_date_added: string | null
          note_user_id: string | null
          raw_json: Json
          synced_at: string
        }
        Insert: {
          contact_id: string
          id: string
          note_body?: string | null
          note_date_added?: string | null
          note_user_id?: string | null
          raw_json?: Json
          synced_at?: string
        }
        Update: {
          contact_id?: string
          id?: string
          note_body?: string | null
          note_date_added?: string | null
          note_user_id?: string | null
          raw_json?: Json
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_tags: {
        Row: {
          contact_id: string
          location_id: string | null
          synced_at: string
          tag_name: string
        }
        Insert: {
          contact_id: string
          location_id?: string | null
          synced_at?: string
          tag_name: string
        }
        Update: {
          contact_id?: string
          location_id?: string | null
          synced_at?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_tasks: {
        Row: {
          assigned_to: string | null
          completed: boolean | null
          contact_id: string
          due_at: string | null
          id: string
          raw_json: Json
          synced_at: string
          task_body: string | null
          title: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed?: boolean | null
          contact_id: string
          due_at?: string | null
          id: string
          raw_json?: Json
          synced_at?: string
          task_body?: string | null
          title?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed?: boolean | null
          contact_id?: string
          due_at?: string | null
          id?: string
          raw_json?: Json
          synced_at?: string
          task_body?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contacts: {
        Row: {
          address1: string | null
          api_top_level_extras: Json
          app_only_project_id: string | null
          assigned_to: string | null
          business_id: string | null
          city: string | null
          company_name: string | null
          contact_name: string | null
          country: string | null
          date_added: string | null
          date_of_birth: string | null
          date_updated: string | null
          dnd: boolean | null
          dnd_settings: Json
          email: string | null
          first_name: string | null
          first_name_raw: string | null
          full_name: string | null
          id: string
          is_app_only: boolean
          last_name: string | null
          last_name_raw: string | null
          location_id: string
          phone: string | null
          postal_code: string | null
          profile_photo: string | null
          raw_json: Json
          source: string | null
          state: string | null
          synced_at: string
          timezone: string | null
          trace_id: string | null
          type: string | null
          webinar_run_id: string | null
          website: string | null
        }
        Insert: {
          address1?: string | null
          api_top_level_extras?: Json
          app_only_project_id?: string | null
          assigned_to?: string | null
          business_id?: string | null
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          date_added?: string | null
          date_of_birth?: string | null
          date_updated?: string | null
          dnd?: boolean | null
          dnd_settings?: Json
          email?: string | null
          first_name?: string | null
          first_name_raw?: string | null
          full_name?: string | null
          id: string
          is_app_only?: boolean
          last_name?: string | null
          last_name_raw?: string | null
          location_id: string
          phone?: string | null
          postal_code?: string | null
          profile_photo?: string | null
          raw_json?: Json
          source?: string | null
          state?: string | null
          synced_at?: string
          timezone?: string | null
          trace_id?: string | null
          type?: string | null
          webinar_run_id?: string | null
          website?: string | null
        }
        Update: {
          address1?: string | null
          api_top_level_extras?: Json
          app_only_project_id?: string | null
          assigned_to?: string | null
          business_id?: string | null
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          date_added?: string | null
          date_of_birth?: string | null
          date_updated?: string | null
          dnd?: boolean | null
          dnd_settings?: Json
          email?: string | null
          first_name?: string | null
          first_name_raw?: string | null
          full_name?: string | null
          id?: string
          is_app_only?: boolean
          last_name?: string | null
          last_name_raw?: string | null
          location_id?: string
          phone?: string | null
          postal_code?: string | null
          profile_photo?: string | null
          raw_json?: Json
          source?: string | null
          state?: string | null
          synced_at?: string
          timezone?: string | null
          trace_id?: string | null
          type?: string | null
          webinar_run_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contacts_app_only_project_id_fkey"
            columns: ["app_only_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_contacts_webinar_run_id_fkey"
            columns: ["webinar_run_id"]
            isOneToOne: false
            referencedRelation: "webinar_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_conversation_messages: {
        Row: {
          alt_id: string | null
          attachments: Json | null
          body: string | null
          contact_id: string
          content_type: string | null
          conversation_id: string
          date_added: string | null
          direction: string | null
          ghl_location_id: string | null
          ghl_type: number | null
          id: string
          message_source: string | null
          message_status: string | null
          message_type: string | null
          message_user_id: string | null
          meta: Json | null
          raw_json: Json
          synced_at: string
        }
        Insert: {
          alt_id?: string | null
          attachments?: Json | null
          body?: string | null
          contact_id: string
          content_type?: string | null
          conversation_id: string
          date_added?: string | null
          direction?: string | null
          ghl_location_id?: string | null
          ghl_type?: number | null
          id: string
          message_source?: string | null
          message_status?: string | null
          message_type?: string | null
          message_user_id?: string | null
          meta?: Json | null
          raw_json?: Json
          synced_at?: string
        }
        Update: {
          alt_id?: string | null
          attachments?: Json | null
          body?: string | null
          contact_id?: string
          content_type?: string | null
          conversation_id?: string
          date_added?: string | null
          direction?: string | null
          ghl_location_id?: string | null
          ghl_type?: number | null
          id?: string
          message_source?: string | null
          message_status?: string | null
          message_type?: string | null
          message_user_id?: string | null
          meta?: Json | null
          raw_json?: Json
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_conversation_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ghl_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_conversations: {
        Row: {
          channel_type: string | null
          contact_id: string
          id: string
          last_message_body: string | null
          last_message_type: string | null
          location_id: string
          preview_email: string | null
          preview_phone: string | null
          raw_json: Json
          synced_at: string
          unread_count: number | null
        }
        Insert: {
          channel_type?: string | null
          contact_id: string
          id: string
          last_message_body?: string | null
          last_message_type?: string | null
          location_id: string
          preview_email?: string | null
          preview_phone?: string | null
          raw_json?: Json
          synced_at?: string
          unread_count?: number | null
        }
        Update: {
          channel_type?: string | null
          contact_id?: string
          id?: string
          last_message_body?: string | null
          last_message_type?: string | null
          location_id?: string
          preview_email?: string | null
          preview_phone?: string | null
          raw_json?: Json
          synced_at?: string
          unread_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_custom_fields: {
        Row: {
          data_type: string | null
          field_id: string
          field_key: string | null
          field_name: string | null
          field_type: string | null
          location_id: string
          picklist_options: Json
          raw_json: Json
          synced_at: string
        }
        Insert: {
          data_type?: string | null
          field_id: string
          field_key?: string | null
          field_name?: string | null
          field_type?: string | null
          location_id: string
          picklist_options?: Json
          raw_json?: Json
          synced_at?: string
        }
        Update: {
          data_type?: string | null
          field_id?: string
          field_key?: string | null
          field_name?: string | null
          field_type?: string | null
          location_id?: string
          picklist_options?: Json
          raw_json?: Json
          synced_at?: string
        }
        Relationships: []
      }
      ghl_invoice_line_items: {
        Row: {
          invoice_id: string
          item_id: string | null
          line_total: number | null
          location_id: string
          name: string | null
          position: number
          price: number | null
          quantity: number | null
          raw_json: Json
          sku: string | null
          synced_at: string
        }
        Insert: {
          invoice_id: string
          item_id?: string | null
          line_total?: number | null
          location_id: string
          name?: string | null
          position: number
          price?: number | null
          quantity?: number | null
          raw_json?: Json
          sku?: string | null
          synced_at?: string
        }
        Update: {
          invoice_id?: string
          item_id?: string | null
          line_total?: number | null
          location_id?: string
          name?: string | null
          position?: number
          price?: number | null
          quantity?: number | null
          raw_json?: Json
          sku?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ghl_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_invoices: {
        Row: {
          contact_id: string | null
          created_at_provider: string | null
          currency: string | null
          discount_amount: number | null
          due_date: string | null
          id: string
          invoice_number: string | null
          location_id: string
          order_id: string | null
          paid_at: string | null
          raw_json: Json
          status: string | null
          subtotal_amount: number | null
          synced_at: string
          tax_amount: number | null
          total_amount: number | null
          updated_at_provider: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at_provider?: string | null
          currency?: string | null
          discount_amount?: number | null
          due_date?: string | null
          id: string
          invoice_number?: string | null
          location_id: string
          order_id?: string | null
          paid_at?: string | null
          raw_json?: Json
          status?: string | null
          subtotal_amount?: number | null
          synced_at?: string
          tax_amount?: number | null
          total_amount?: number | null
          updated_at_provider?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at_provider?: string | null
          currency?: string | null
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          location_id?: string
          order_id?: string | null
          paid_at?: string | null
          raw_json?: Json
          status?: string | null
          subtotal_amount?: number | null
          synced_at?: string
          tax_amount?: number | null
          total_amount?: number | null
          updated_at_provider?: string | null
        }
        Relationships: []
      }
      ghl_order_line_items: {
        Row: {
          item_id: string | null
          line_total: number | null
          location_id: string
          name: string | null
          order_id: string
          position: number
          price: number | null
          quantity: number | null
          raw_json: Json
          sku: string | null
          synced_at: string
        }
        Insert: {
          item_id?: string | null
          line_total?: number | null
          location_id: string
          name?: string | null
          order_id: string
          position: number
          price?: number | null
          quantity?: number | null
          raw_json?: Json
          sku?: string | null
          synced_at?: string
        }
        Update: {
          item_id?: string | null
          line_total?: number | null
          location_id?: string
          name?: string | null
          order_id?: string
          position?: number
          price?: number | null
          quantity?: number | null
          raw_json?: Json
          sku?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_order_line_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ghl_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_orders: {
        Row: {
          contact_id: string | null
          created_at_provider: string | null
          currency: string | null
          discount_amount: number | null
          id: string
          location_id: string
          paid_amount: number | null
          raw_json: Json
          status: string | null
          subtotal_amount: number | null
          synced_at: string
          tax_amount: number | null
          total_amount: number | null
          updated_at_provider: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at_provider?: string | null
          currency?: string | null
          discount_amount?: number | null
          id: string
          location_id: string
          paid_amount?: number | null
          raw_json?: Json
          status?: string | null
          subtotal_amount?: number | null
          synced_at?: string
          tax_amount?: number | null
          total_amount?: number | null
          updated_at_provider?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at_provider?: string | null
          currency?: string | null
          discount_amount?: number | null
          id?: string
          location_id?: string
          paid_amount?: number | null
          raw_json?: Json
          status?: string | null
          subtotal_amount?: number | null
          synced_at?: string
          tax_amount?: number | null
          total_amount?: number | null
          updated_at_provider?: string | null
        }
        Relationships: []
      }
      ghl_sync_cursors: {
        Row: {
          contacts_start_after_id: string | null
          location_id: string
          updated_at: string
        }
        Insert: {
          contacts_start_after_id?: string | null
          location_id: string
          updated_at?: string
        }
        Update: {
          contacts_start_after_id?: string | null
          location_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          api_key: string | null
          api_secret_encrypted: string | null
          client_id: string | null
          client_secret_encrypted: string | null
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
          api_secret_encrypted?: string | null
          client_id?: string | null
          client_secret_encrypted?: string | null
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
          api_secret_encrypted?: string | null
          client_id?: string | null
          client_secret_encrypted?: string | null
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
      /**
       * Job queue — merged when not returned by `supabase gen types` for this project.
       */
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
      ad_spend_run_attribution: {
        Row: {
          agency_line: string
          attribution_method: string
          computed_at: string
          currency: string
          date_from: string | null
          date_to: string | null
          id: string
          integration_account_id: string | null
          project_id: string
          source_system: string
          spend: number
          webinar_run_id: string
        }
        Insert: {
          agency_line: string
          attribution_method?: string
          computed_at?: string
          currency?: string
          date_from?: string | null
          date_to?: string | null
          id?: string
          integration_account_id?: string | null
          project_id: string
          source_system?: string
          spend?: number
          webinar_run_id: string
        }
        Update: {
          agency_line?: string
          attribution_method?: string
          computed_at?: string
          currency?: string
          date_from?: string | null
          date_to?: string | null
          id?: string
          integration_account_id?: string | null
          project_id?: string
          source_system?: string
          spend?: number
          webinar_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_spend_run_attribution_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_spend_run_attribution_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_spend_run_attribution_webinar_run_id_fkey"
            columns: ["webinar_run_id"]
            isOneToOne: false
            referencedRelation: "webinar_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          created_at: string
          id: string
          integration_account_id: string
          name: string | null
          objective: string | null
          raw_json: Json | null
          status: string | null
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          id: string
          integration_account_id: string
          name?: string | null
          objective?: string | null
          raw_json?: Json | null
          status?: string | null
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          integration_account_id?: string
          name?: string | null
          objective?: string | null
          raw_json?: Json | null
          status?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_insights: {
        Row: {
          adset_id: string | null
          campaign_id: string
          campaign_name: string | null
          clicks: number | null
          currency: string | null
          date_start: string
          date_stop: string
          id: string
          impressions: number | null
          integration_account_id: string
          leads: number | null
          reach: number | null
          raw_json: Json | null
          spend: number | null
          synced_at: string | null
        }
        Insert: {
          adset_id?: string | null
          campaign_id: string
          campaign_name?: string | null
          clicks?: number | null
          currency?: string | null
          date_start: string
          date_stop: string
          id?: string
          impressions?: number | null
          integration_account_id: string
          leads?: number | null
          reach?: number | null
          raw_json?: Json | null
          spend?: number | null
          synced_at?: string | null
        }
        Update: {
          adset_id?: string | null
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number | null
          currency?: string | null
          date_start?: string
          date_stop?: string
          id?: string
          impressions?: number | null
          integration_account_id?: string
          leads?: number | null
          reach?: number | null
          raw_json?: Json | null
          spend?: number | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_insights_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_insights: {
        Row: {
          ad_id: string
          ad_name: string | null
          adset_id: string
          campaign_id: string
          campaign_name: string | null
          clicks: number | null
          currency: string | null
          date_start: string
          date_stop: string
          id: string
          impressions: number | null
          integration_account_id: string
          leads: number | null
          reach: number | null
          raw_json: Json | null
          spend: number | null
          synced_at: string | null
        }
        Insert: {
          ad_id: string
          ad_name?: string | null
          adset_id: string
          campaign_id: string
          campaign_name?: string | null
          clicks?: number | null
          currency?: string | null
          date_start: string
          date_stop: string
          id?: string
          impressions?: number | null
          integration_account_id: string
          leads?: number | null
          reach?: number | null
          raw_json?: Json | null
          spend?: number | null
          synced_at?: string | null
        }
        Update: {
          ad_id?: string
          ad_name?: string | null
          adset_id?: string
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number | null
          currency?: string | null
          date_start?: string
          date_stop?: string
          id?: string
          impressions?: number | null
          integration_account_id?: string
          leads?: number | null
          reach?: number | null
          raw_json?: Json | null
          spend?: number | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_insights_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          adset_id: string
          campaign_id: string
          created_at: string
          id: string
          integration_account_id: string
          name: string | null
          raw_json: Json | null
          status: string | null
          synced_at: string | null
        }
        Insert: {
          adset_id: string
          campaign_id: string
          created_at?: string
          id: string
          integration_account_id: string
          name?: string | null
          raw_json?: Json | null
          status?: string | null
          synced_at?: string | null
        }
        Update: {
          adset_id?: string
          campaign_id?: string
          created_at?: string
          id?: string
          integration_account_id?: string
          name?: string | null
          raw_json?: Json | null
          status?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adset_insights: {
        Row: {
          adset_id: string
          adset_name: string | null
          campaign_id: string
          campaign_name: string | null
          clicks: number | null
          currency: string | null
          date_start: string
          date_stop: string
          id: string
          impressions: number | null
          integration_account_id: string
          leads: number | null
          reach: number | null
          raw_json: Json | null
          spend: number | null
          synced_at: string | null
        }
        Insert: {
          adset_id: string
          adset_name?: string | null
          campaign_id: string
          campaign_name?: string | null
          clicks?: number | null
          currency?: string | null
          date_start: string
          date_stop: string
          id?: string
          impressions?: number | null
          integration_account_id: string
          leads?: number | null
          reach?: number | null
          raw_json?: Json | null
          spend?: number | null
          synced_at?: string | null
        }
        Update: {
          adset_id?: string
          adset_name?: string | null
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number | null
          currency?: string | null
          date_start?: string
          date_stop?: string
          id?: string
          impressions?: number | null
          integration_account_id?: string
          leads?: number | null
          reach?: number | null
          raw_json?: Json | null
          spend?: number | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_adset_insights_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adsets: {
        Row: {
          billing_event: string | null
          campaign_id: string
          created_at: string
          daily_budget: number | null
          id: string
          integration_account_id: string
          lifetime_budget: number | null
          name: string | null
          optimization_goal: string | null
          raw_json: Json | null
          status: string | null
          synced_at: string | null
        }
        Insert: {
          billing_event?: string | null
          campaign_id: string
          created_at?: string
          daily_budget?: number | null
          id: string
          integration_account_id: string
          lifetime_budget?: number | null
          name?: string | null
          optimization_goal?: string | null
          raw_json?: Json | null
          status?: string | null
          synced_at?: string | null
        }
        Update: {
          billing_event?: string | null
          campaign_id?: string
          created_at?: string
          daily_budget?: number | null
          id?: string
          integration_account_id?: string
          lifetime_budget?: number | null
          name?: string | null
          optimization_goal?: string | null
          raw_json?: Json | null
          status?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_adsets_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_meta_ad_accounts: {
        Row: {
          agency_line: string
          created_at: string
          id: string
          integration_account_id: string
          project_id: string
        }
        Insert: {
          agency_line: string
          created_at?: string
          id?: string
          integration_account_id: string
          project_id: string
        }
        Update: {
          agency_line?: string
          created_at?: string
          id?: string
          integration_account_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_meta_ad_accounts_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_meta_ad_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_events: {
        Row: {
          contact_id: string | null
          created_at: string
          duration_seconds: number | null
          event_type: string
          id: string
          location_id: string | null
          occurred_at: string
          payload: Json
          project_id: string
          source_system: string
          webinar_run_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          event_type: string
          id?: string
          location_id?: string | null
          occurred_at: string
          payload?: Json
          project_id: string
          source_system: string
          webinar_run_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          event_type?: string
          id?: string
          location_id?: string | null
          occurred_at?: string
          payload?: Json
          project_id?: string
          source_system?: string
          webinar_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_events_webinar_run_id_fkey"
            columns: ["webinar_run_id"]
            isOneToOne: false
            referencedRelation: "webinar_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          ghl_location_id: string | null
          id: string
          name: string
          traffic_agency_line_tags: Json | null
          traffic_breakdown_fields: Json | null
          traffic_occupation_field_id: string | null
          traffic_occupation_field_key: string | null
          updated_at: string | null
          workspace_id: string
          zoom_account_id: string | null
          zoom_client_id: string | null
          zoom_client_secret_encrypted: string | null
          zoom_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          ghl_location_id?: string | null
          id?: string
          name: string
          traffic_agency_line_tags?: Json | null
          traffic_breakdown_fields?: Json | null
          traffic_occupation_field_id?: string | null
          traffic_occupation_field_key?: string | null
          updated_at?: string | null
          workspace_id: string
          zoom_account_id?: string | null
          zoom_client_id?: string | null
          zoom_client_secret_encrypted?: string | null
          zoom_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          ghl_location_id?: string | null
          id?: string
          name?: string
          traffic_agency_line_tags?: Json | null
          traffic_breakdown_fields?: Json | null
          traffic_occupation_field_id?: string | null
          traffic_occupation_field_key?: string | null
          updated_at?: string | null
          workspace_id?: string
          zoom_account_id?: string | null
          zoom_client_id?: string | null
          zoom_client_secret_encrypted?: string | null
          zoom_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_runs: {
        Row: {
          created_at: string
          display_label: string
          event_end_at: string
          event_start_at: string
          format: string
          id: string
          is_active: boolean
          location_id: string
          project_id: string | null
          sort_order: number | null
          spend_date_from: string | null
          spend_date_to: string | null
          timezone: string
          updated_at: string
          zoom_meeting_id: string | null
          zoom_source_type: string | null
        }
        Insert: {
          created_at?: string
          display_label: string
          event_end_at: string
          event_start_at: string
          format?: string
          id?: string
          is_active?: boolean
          location_id: string
          project_id?: string | null
          sort_order?: number | null
          spend_date_from?: string | null
          spend_date_to?: string | null
          timezone?: string
          updated_at?: string
          zoom_meeting_id?: string | null
          zoom_source_type?: string | null
        }
        Update: {
          created_at?: string
          display_label?: string
          event_end_at?: string
          event_start_at?: string
          format?: string
          id?: string
          is_active?: boolean
          location_id?: string
          project_id?: string | null
          sort_order?: number | null
          spend_date_from?: string | null
          spend_date_to?: string | null
          timezone?: string
          updated_at?: string
          zoom_meeting_id?: string | null
          zoom_source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webinar_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      zoom_attendance_segments: {
        Row: {
          contact_id: string | null
          duration_seconds: number
          id: string
          idempotency_key: string
          join_at: string
          leave_at: string | null
          location_id: string
          participant_email: string | null
          project_id: string
          raw_payload: Json
          synced_at: string
          webinar_run_id: string
          zoom_meeting_id: string
        }
        Insert: {
          contact_id?: string | null
          duration_seconds?: number
          id?: string
          idempotency_key: string
          join_at: string
          leave_at?: string | null
          location_id: string
          participant_email?: string | null
          project_id: string
          raw_payload?: Json
          synced_at?: string
          webinar_run_id: string
          zoom_meeting_id: string
        }
        Update: {
          contact_id?: string | null
          duration_seconds?: number
          id?: string
          idempotency_key?: string
          join_at?: string
          leave_at?: string | null
          location_id?: string
          participant_email?: string | null
          project_id?: string
          raw_payload?: Json
          synced_at?: string
          webinar_run_id?: string
          zoom_meeting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_attendance_segments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_attendance_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoom_attendance_segments_webinar_run_id_fkey"
            columns: ["webinar_run_id"]
            isOneToOne: false
            referencedRelation: "webinar_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      /**
       * Public `users` mirror — merged when not returned by `supabase gen types` for this project.
       */
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_next_webinar_run_for_contact: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      backfill_webinar_runs_for_location: {
        Args: { p_location_id: string }
        Returns: number
      }
      traffic_lead_source_breakdown: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_line_tags: string[]
          p_location_id: string
        }
        Returns: {
          lead_count: number
          lead_source_key: string
          run_display_label: string
          webinar_run_id: string
        }[]
      }
      traffic_occupation_breakdown: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_line_tags: string[]
          p_location_id: string
          p_occupation_field_id: string
        }
        Returns: {
          lead_count: number
          occupation_label: string
          run_display_label: string
          webinar_run_id: string
        }[]
      }
      get_showup_stats: {
        Args: {
          p_workspace_id: string
          p_project_id: string
          p_webinar_run_id: string
          p_date_from: string | null
          p_date_to: string | null
        }
        Returns: {
          line_bucket: string
          denominator: number
          numerator: number
          showup_rate: number | null
        }[]
      }
      recompute_meta_spend_attribution: {
        Args: {
          p_project_id: string
        }
        Returns: {
          webinar_run_id: string
          agency_line: string
          spend: number
          currency: string
          date_from: string | null
          date_to: string | null
          rows_attributed: number
        }[]
      }
      get_agency_stats: {
        Args: {
          p_workspace_id: string
          p_project_id: string
          p_webinar_run_id: string
          p_date_from: string | null
          p_date_to: string | null
        }
        Returns: {
          agency_line: string
          webinar_run_id: string
          run_label: string
          leads: number
          showed: number
          showup_rate: number | null
          buyers: number
          conversion_rate: number | null
          ad_spend: number | null
          ad_spend_currency: string | null
          cpl: number | null
          cpa: number | null
        }[]
      }
      get_buyer_behavior_stats: {
        Args: {
          p_workspace_id: string
          p_project_id: string
          p_webinar_run_id: string
          p_date_from: string | null
          p_date_to: string | null
        }
        Returns: {
          section: string
          label: string
          sort_key: number
          bigint_val: number | null
          numeric_val: number | null
          pct: number | null
        }[]
      }
      get_traffic_all_runs: {
        Args: {
          p_project_id: string
          p_workspace_id: string
          p_line_tags?: string[] | null
          /** Subset of utm_source, utm_medium, utm_campaign, utm_content (canonical order in RPC). */
          p_utm_axes?: string[] | null
        }
        Returns: {
          run_id: string
          run_start_at: string
          section_key: string
          section_label: string
          row_label: string
          lead_count: number
        }[]
      }
      get_showup_all_runs: {
        Args: {
          p_project_id: string
          p_workspace_id: string
        }
        Returns: {
          run_id: string
          run_start_at: string
          section_key: string
          section_label: string
          row_label: string
          attended: number
          total: number
        }[]
      }
      get_buyer_behavior_all_runs: {
        Args: {
          p_project_id: string
          p_workspace_id: string
        }
        Returns: {
          run_id: string
          run_start_at: string
          section: string
          label: string
          count: number
          pct: number | null
        }[]
      }
      get_agency_all_runs: {
        Args: {
          p_project_id: string
          p_workspace_id: string
        }
        Returns: {
          run_id: string
          run_start_at: string
          agency_line: string
          leads: number
          showed: number
          buyers: number
          showup_rate: number | null
          conv_rate: number | null
          ad_spend: number | null
          ad_spend_currency: string | null
          cpl: number | null
          cpa: number | null
        }[]
      }
    }
    Enums: {
      integration_job_status: "pending" | "processing" | "done" | "error"
      integration_provider:
        | "zoom"
        | "vapi"
        | "google_sheets"
        | "gohighlevel"
        | "meta_ads"
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
