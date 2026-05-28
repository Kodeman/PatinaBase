export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      _comms_backfill_legacy_map: {
        Row: {
          legacy_message_id: string
          migrated_at: string
          new_message_id: string
        }
        Insert: {
          legacy_message_id: string
          migrated_at?: string
          new_message_id: string
        }
        Update: {
          legacy_message_id?: string
          migrated_at?: string
          new_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "_comms_backfill_legacy_map_legacy_message_id_fkey"
            columns: ["legacy_message_id"]
            isOneToOne: true
            referencedRelation: "client_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "_comms_backfill_legacy_map_new_message_id_fkey"
            columns: ["new_message_id"]
            isOneToOne: false
            referencedRelation: "comms_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletion_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          deleted_data: Json | null
          id: string
          notes: string | null
          processing_started_at: string | null
          reason: string | null
          requested_at: string
          scheduled_for: string
          status: Database["public"]["Enums"]["account_deletion_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_data?: Json | null
          id?: string
          notes?: string | null
          processing_started_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for: string
          status?: Database["public"]["Enums"]["account_deletion_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_data?: Json | null
          id?: string
          notes?: string | null
          processing_started_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["account_deletion_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          environment: Database["public"]["Enums"]["api_key_environment"]
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          last_used_ip: unknown
          name: string
          organization_id: string
          rate_limit: number
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["api_key_status"]
        }
        Insert: {
          created_at?: string
          created_by: string
          environment?: Database["public"]["Enums"]["api_key_environment"]
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name: string
          organization_id: string
          rate_limit?: number
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["api_key_status"]
        }
        Update: {
          created_at?: string
          created_by?: string
          environment?: Database["public"]["Enums"]["api_key_environment"]
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name?: string
          organization_id?: string
          rate_limit?: number
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["api_key_status"]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      appeal_signals: {
        Row: {
          category: Database["public"]["Enums"]["appeal_category"]
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["appeal_category"]
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["appeal_category"]
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      application_communications: {
        Row: {
          application_id: string
          application_type: string
          body_html: string | null
          body_text: string | null
          channel: string
          created_at: string
          error: string | null
          id: string
          provider_id: string | null
          sent_by: string | null
          status: string
          subject: string
          template_id: string | null
          to_email: string
        }
        Insert: {
          application_id: string
          application_type: string
          body_html?: string | null
          body_text?: string | null
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          template_id?: string | null
          to_email: string
        }
        Update: {
          application_id?: string
          application_type?: string
          body_html?: string | null
          body_text?: string | null
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          to_email?: string
        }
        Relationships: []
      }
      audience_segments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          estimated_size: number | null
          id: string
          is_preset: boolean
          name: string
          rules: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_size?: number | null
          id?: string
          is_preset?: boolean
          name: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_size?: number | null
          id?: string
          is_preset?: boolean
          name?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          status: Database["public"]["Enums"]["audit_status"]
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          status?: Database["public"]["Enums"]["audit_status"]
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          status?: Database["public"]["Enums"]["audit_status"]
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      automated_sequences: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          emails: Json
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          status: Database["public"]["Enums"]["sequence_status"]
          steps_json: Json
          total_completed: number
          total_emails_sent: number
          total_enrolled: number
          trigger_config: Json
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          emails?: Json
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          status?: Database["public"]["Enums"]["sequence_status"]
          steps_json?: Json
          total_completed?: number
          total_emails_sent?: number
          total_enrolled?: number
          trigger_config?: Json
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          emails?: Json
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          status?: Database["public"]["Enums"]["sequence_status"]
          steps_json?: Json
          total_completed?: number
          total_emails_sent?: number
          total_enrolled?: number
          trigger_config?: Json
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automated_sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automated_sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_analytics: {
        Row: {
          bounced: number
          campaign_id: string
          clicked: number
          delivered: number
          opened: number
          unsubscribed: number
          updated_at: string
        }
        Insert: {
          bounced?: number
          campaign_id: string
          clicked?: number
          delivered?: number
          opened?: number
          unsubscribed?: number
          updated_at?: string
        }
        Update: {
          bounced?: number
          campaign_id?: string
          clicked?: number
          delivered?: number
          opened?: number
          unsubscribed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_analytics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ab_decided_at: string | null
          ab_enabled: boolean
          ab_split_pct: number | null
          ab_subject_b: string | null
          ab_winner: string | null
          audience_segment: Json | null
          audience_segment_id: string | null
          audience_snapshot: Json | null
          audience_type: Database["public"]["Enums"]["audience_type"]
          bounce_count: number
          click_count: number
          content_json: Json | null
          created_at: string
          created_by: string | null
          email_template_id: string | null
          id: string
          name: string
          open_count: number
          preview_text: string | null
          scheduled_for: string | null
          sent_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          subject: string
          template_data: Json
          template_id: string
          total_recipients: number | null
          unsubscribe_count: number
          updated_at: string
        }
        Insert: {
          ab_decided_at?: string | null
          ab_enabled?: boolean
          ab_split_pct?: number | null
          ab_subject_b?: string | null
          ab_winner?: string | null
          audience_segment?: Json | null
          audience_segment_id?: string | null
          audience_snapshot?: Json | null
          audience_type?: Database["public"]["Enums"]["audience_type"]
          bounce_count?: number
          click_count?: number
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          email_template_id?: string | null
          id?: string
          name: string
          open_count?: number
          preview_text?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          subject: string
          template_data?: Json
          template_id: string
          total_recipients?: number | null
          unsubscribe_count?: number
          updated_at?: string
        }
        Update: {
          ab_decided_at?: string | null
          ab_enabled?: boolean
          ab_split_pct?: number | null
          ab_subject_b?: string | null
          ab_winner?: string | null
          audience_segment?: Json | null
          audience_segment_id?: string | null
          audience_snapshot?: Json | null
          audience_type?: Database["public"]["Enums"]["audience_type"]
          bounce_count?: number
          click_count?: number
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          email_template_id?: string | null
          id?: string
          name?: string
          open_count?: number
          preview_text?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          template_data?: Json
          template_id?: string
          total_recipients?: number | null
          unsubscribe_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_audience_segment_id_fkey"
            columns: ["audience_segment_id"]
            isOneToOne: false
            referencedRelation: "audience_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          parent_id: string | null
          product_count: number | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          product_count?: number | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          product_count?: number | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activity_log: {
        Row: {
          activity_type: string
          actor_name: string | null
          created_at: string
          description: string | null
          designer_client_id: string
          id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          activity_type: string
          actor_name?: string | null
          created_at?: string
          description?: string | null
          designer_client_id: string
          id?: string
          metadata?: Json | null
          title: string
        }
        Update: {
          activity_type?: string
          actor_name?: string | null
          created_at?: string
          description?: string | null
          designer_client_id?: string
          id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activity_log_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_archetypes: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          typical_budget_range: Json | null
          visual_cues: string[] | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          typical_budget_range?: Json | null
          visual_cues?: string[] | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          typical_budget_range?: Json | null
          visual_cues?: string[] | null
        }
        Relationships: []
      }
      client_decision_options: {
        Row: {
          client_note: string | null
          cost_delta_cents: number | null
          created_at: string
          decision_id: string
          designer_note: string | null
          id: string
          image_url: string | null
          is_recommended: boolean | null
          lead_time_days_delta: number | null
          name: string
          price: number | null
          quantity: number | null
          selected: boolean | null
          sort_order: number | null
        }
        Insert: {
          client_note?: string | null
          cost_delta_cents?: number | null
          created_at?: string
          decision_id: string
          designer_note?: string | null
          id?: string
          image_url?: string | null
          is_recommended?: boolean | null
          lead_time_days_delta?: number | null
          name: string
          price?: number | null
          quantity?: number | null
          selected?: boolean | null
          sort_order?: number | null
        }
        Update: {
          client_note?: string | null
          cost_delta_cents?: number | null
          created_at?: string
          decision_id?: string
          designer_note?: string | null
          id?: string
          image_url?: string | null
          is_recommended?: boolean | null
          lead_time_days_delta?: number | null
          name?: string
          price?: number | null
          quantity?: number | null
          selected?: boolean | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_decision_options_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_decisions: {
        Row: {
          blocking_status: string
          client_consent_method: string | null
          client_consented_at: string | null
          client_signature: string | null
          context: string | null
          created_at: string
          decision_type: string
          designer_client_id: string
          designer_id: string
          due_date: string | null
          id: string
          linked_phase: string | null
          linked_proposal_id: string | null
          phase_id: string | null
          project_id: string | null
          recommended_option_id: string | null
          reminder_sent_at: string | null
          responded_at: string | null
          selected_by: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          blocking_status?: string
          client_consent_method?: string | null
          client_consented_at?: string | null
          client_signature?: string | null
          context?: string | null
          created_at?: string
          decision_type?: string
          designer_client_id: string
          designer_id: string
          due_date?: string | null
          id?: string
          linked_phase?: string | null
          linked_proposal_id?: string | null
          phase_id?: string | null
          project_id?: string | null
          recommended_option_id?: string | null
          reminder_sent_at?: string | null
          responded_at?: string | null
          selected_by?: string | null
          sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          blocking_status?: string
          client_consent_method?: string | null
          client_consented_at?: string | null
          client_signature?: string | null
          context?: string | null
          created_at?: string
          decision_type?: string
          designer_client_id?: string
          designer_id?: string
          due_date?: string | null
          id?: string
          linked_phase?: string | null
          linked_proposal_id?: string | null
          phase_id?: string | null
          project_id?: string | null
          recommended_option_id?: string | null
          reminder_sent_at?: string | null
          responded_at?: string | null
          selected_by?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_decisions_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_decisions_linked_proposal_id_fkey"
            columns: ["linked_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_decisions_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_decisions_recommended_option_id_fkey"
            columns: ["recommended_option_id"]
            isOneToOne: false
            referencedRelation: "client_decision_options"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          designer_id: string
          email: string
          expires_at: string
          id: string
          personal_message: string | null
          project_id: string | null
          sent_at: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          designer_id: string
          email: string
          expires_at?: string
          id?: string
          personal_message?: string | null
          project_id?: string | null
          sent_at?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          designer_id?: string
          email?: string
          expires_at?: string
          id?: string
          personal_message?: string | null
          project_id?: string | null
          sent_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_messages: {
        Row: {
          archived_by_recipient: boolean | null
          archived_by_sender: boolean | null
          attachments: Json | null
          body: string
          created_at: string
          designer_client_id: string | null
          id: string
          project_id: string | null
          proposal_id: string | null
          read_at: string | null
          recipient_id: string
          sender_id: string
          subject: string | null
        }
        Insert: {
          archived_by_recipient?: boolean | null
          archived_by_sender?: boolean | null
          attachments?: Json | null
          body: string
          created_at?: string
          designer_client_id?: string | null
          id?: string
          project_id?: string | null
          proposal_id?: string | null
          read_at?: string | null
          recipient_id: string
          sender_id: string
          subject?: string | null
        }
        Update: {
          archived_by_recipient?: boolean | null
          archived_by_sender?: boolean | null
          attachments?: Json | null
          body?: string
          created_at?: string
          designer_client_id?: string | null
          id?: string
          project_id?: string | null
          proposal_id?: string | null
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      client_nurture_touchpoints: {
        Row: {
          created_at: string
          designer_client_id: string
          id: string
          product_id: string | null
          reason: string | null
          status: string
          suggested_date: string | null
          touchpoint_type: string
        }
        Insert: {
          created_at?: string
          designer_client_id: string
          id?: string
          product_id?: string | null
          reason?: string | null
          status?: string
          suggested_date?: string | null
          touchpoint_type: string
        }
        Update: {
          created_at?: string
          designer_client_id?: string
          id?: string
          product_id?: string | null
          reason?: string | null
          status?: string
          suggested_date?: string | null
          touchpoint_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_nurture_touchpoints_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_nurture_touchpoints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_nurture_touchpoints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          archetype: string | null
          budget_range: Json | null
          created_at: string | null
          id: string
          project_id: string | null
          quiz_responses: Json | null
          style_preferences: string[] | null
          updated_at: string | null
        }
        Insert: {
          archetype?: string | null
          budget_range?: Json | null
          created_at?: string | null
          id?: string
          project_id?: string | null
          quiz_responses?: Json | null
          style_preferences?: string[] | null
          updated_at?: string | null
        }
        Update: {
          archetype?: string | null
          budget_range?: Json | null
          created_at?: string | null
          id?: string
          project_id?: string | null
          quiz_responses?: Json | null
          style_preferences?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reviews: {
        Row: {
          created_at: string
          custom_message: string | null
          designer_client_id: string
          id: string
          project_id: string | null
          published_to_portfolio: boolean | null
          rating: number | null
          referral_count: number | null
          request_sent_at: string | null
          request_status: string
          review_text: string | null
          scheduled_for: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_message?: string | null
          designer_client_id: string
          id?: string
          project_id?: string | null
          published_to_portfolio?: boolean | null
          rating?: number | null
          referral_count?: number | null
          request_sent_at?: string | null
          request_status?: string
          review_text?: string | null
          scheduled_for?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_message?: string | null
          designer_client_id?: string
          id?: string
          project_id?: string | null
          published_to_portfolio?: boolean | null
          rating?: number | null
          referral_count?: number | null
          request_sent_at?: string | null
          request_status?: string
          review_text?: string | null
          scheduled_for?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reviews_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_products: {
        Row: {
          added_at: string | null
          collection_id: string
          id: string
          notes: string | null
          position: number | null
          product_id: string
        }
        Insert: {
          added_at?: string | null
          collection_id: string
          id?: string
          notes?: string | null
          position?: number | null
          product_id: string
        }
        Update: {
          added_at?: string | null
          collection_id?: string
          id?: string
          notes?: string | null
          position?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      collections: {
        Row: {
          cover_image: string | null
          created_at: string | null
          created_by: string
          description: string | null
          display_order: number | null
          featured: boolean | null
          id: string
          is_public: boolean | null
          name: string
          published_at: string | null
          rule: Json | null
          scheduled_publish_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string | null
          status: string | null
          tags: string[] | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          cover_image?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          display_order?: number | null
          featured?: boolean | null
          id?: string
          is_public?: boolean | null
          name: string
          published_at?: string | null
          rule?: Json | null
          scheduled_publish_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          status?: string | null
          tags?: string[] | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          cover_image?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          display_order?: number | null
          featured?: boolean | null
          id?: string
          is_public?: boolean | null
          name?: string
          published_at?: string | null
          rule?: Json | null
          scheduled_publish_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          status?: string | null
          tags?: string[] | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      comms_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          decision_id: string | null
          deleted_at: string | null
          edited_at: string | null
          id: string
          mentions: string[]
          reply_to_message_id: string | null
          sender_id: string | null
          system: boolean
          thread_id: string
        }
        Insert: {
          attachments?: Json
          body?: string
          created_at?: string
          decision_id?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentions?: string[]
          reply_to_message_id?: string | null
          sender_id?: string | null
          system?: boolean
          thread_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          decision_id?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentions?: string[]
          reply_to_message_id?: string | null
          sender_id?: string | null
          system?: boolean
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_messages_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "comms_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "comms_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_quick_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          label: string
          position: number
          profile_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          label: string
          position?: number
          profile_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          label?: string
          position?: number
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_quick_replies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_quick_replies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_thread_participants: {
        Row: {
          archived_at: string | null
          joined_at: string
          last_read_at: string
          left_at: string | null
          muted_at: string | null
          notification_pref: string
          profile_id: string
          role: string
          thread_id: string
        }
        Insert: {
          archived_at?: string | null
          joined_at?: string
          last_read_at?: string
          left_at?: string | null
          muted_at?: string | null
          notification_pref?: string
          profile_id: string
          role: string
          thread_id: string
        }
        Update: {
          archived_at?: string | null
          joined_at?: string
          last_read_at?: string
          left_at?: string | null
          muted_at?: string | null
          notification_pref?: string
          profile_id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_thread_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_thread_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "comms_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          last_message_at: string
          metadata: Json
          project_id: string | null
          proposal_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
          last_message_at?: string
          metadata?: Json
          project_id?: string | null
          proposal_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          last_message_at?: string
          metadata?: Json
          project_id?: string | null
          proposal_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_threads_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_conversations: {
        Row: {
          created_at: string
          id: string
          initial_context: Json | null
          initial_screen: string | null
          last_message_at: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          initial_context?: Json | null
          initial_screen?: string | null
          last_message_at?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          initial_context?: Json | null
          initial_screen?: string | null
          last_message_at?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companion_messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          product_context: string | null
          role: Database["public"]["Enums"]["companion_message_role"]
          room_context: string | null
          screen_context: string | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_context?: string | null
          role: Database["public"]["Enums"]["companion_message_role"]
          room_context?: string | null
          screen_context?: string | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_context?: string | null
          role?: Database["public"]["Enums"]["companion_message_role"]
          room_context?: string | null
          screen_context?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "companion_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_quick_action_log: {
        Row: {
          action_id: string
          action_type: string
          completed: boolean | null
          context: Json | null
          created_at: string
          id: string
          screen: string
          user_id: string
        }
        Insert: {
          action_id: string
          action_type: string
          completed?: boolean | null
          context?: Json | null
          created_at?: string
          id?: string
          screen: string
          user_id: string
        }
        Update: {
          action_id?: string
          action_type?: string
          completed?: boolean | null
          context?: Json | null
          created_at?: string
          id?: string
          screen?: string
          user_id?: string
        }
        Relationships: []
      }
      consent_audit_log: {
        Row: {
          action: string
          consent_type: string
          consent_version: string | null
          created_at: string
          granted: boolean
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          consent_type: string
          consent_version?: string | null
          created_at?: string
          granted: boolean
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          consent_type?: string
          consent_version?: string | null
          created_at?: string
          granted?: boolean
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          consent_type: string
          consent_version: string | null
          created_at: string
          granted: boolean
          granted_at: string | null
          id: string
          ip_address: unknown
          revoked_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_type: string
          consent_version?: string | null
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_type?: string
          consent_version?: string | null
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cowork_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          cron_expression: string | null
          error_message: string | null
          id: string
          input_payload: Json | null
          is_recurring: boolean | null
          last_run_at: string | null
          max_retries: number | null
          next_run_at: string | null
          output_files: string[] | null
          output_payload: Json | null
          picked_up_at: string | null
          retry_count: number | null
          status: string
          task_type: string
          vendor_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cron_expression?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json | null
          is_recurring?: boolean | null
          last_run_at?: string | null
          max_retries?: number | null
          next_run_at?: string | null
          output_files?: string[] | null
          output_payload?: Json | null
          picked_up_at?: string | null
          retry_count?: number | null
          status?: string
          task_type: string
          vendor_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cron_expression?: string | null
          error_message?: string | null
          id?: string
          input_payload?: Json | null
          is_recurring?: boolean | null
          last_run_at?: string | null
          max_retries?: number | null
          next_run_at?: string | null
          output_files?: string[] | null
          output_payload?: Json | null
          picked_up_at?: string | null
          retry_count?: number | null
          status?: string
          task_type?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cowork_tasks_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "pipeline_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_stories: {
        Row: {
          body_content: string | null
          created_at: string | null
          embedded_products: string[] | null
          engagement_summary: Json | null
          hero_image_url: string
          id: string
          maker_id: string | null
          publish_date: string
          read_time_minutes: number | null
          status: string | null
          story_type: string
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          body_content?: string | null
          created_at?: string | null
          embedded_products?: string[] | null
          engagement_summary?: Json | null
          hero_image_url: string
          id?: string
          maker_id?: string | null
          publish_date: string
          read_time_minutes?: number | null
          status?: string | null
          story_type: string
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          body_content?: string | null
          created_at?: string | null
          embedded_products?: string[] | null
          engagement_summary?: Json | null
          hero_image_url?: string
          id?: string
          maker_id?: string | null
          publish_date?: string
          read_time_minutes?: number | null
          status?: string | null
          story_type?: string
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      damage_claims: {
        Row: {
          created_at: string
          description: string | null
          id: string
          receiving_inspection_id: string
          resolution_notes: string | null
          resolved_at: string | null
          state: Database["public"]["Enums"]["damage_claim_state"]
          updated_at: string
          vendor_notified_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          receiving_inspection_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["damage_claim_state"]
          updated_at?: string
          vendor_notified_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          receiving_inspection_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["damage_claim_state"]
          updated_at?: string
          vendor_notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_claims_receiving_inspection_id_fkey"
            columns: ["receiving_inspection_id"]
            isOneToOne: false
            referencedRelation: "receiving_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      data_erasure_log: {
        Row: {
          completed: boolean
          erased_at: string
          id: string
          reason: string | null
          requested_by_user_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          erased_at?: string
          id?: string
          reason?: string | null
          requested_by_user_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          erased_at?: string
          id?: string
          reason?: string | null
          requested_by_user_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      data_export_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          download_url: string | null
          error: string | null
          expires_at: string | null
          file_size_bytes: number | null
          id: string
          included_data: string[]
          notes: string | null
          processing_started_at: string | null
          requested_at: string
          retry_count: number
          status: Database["public"]["Enums"]["data_export_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          download_url?: string | null
          error?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          included_data?: string[]
          notes?: string | null
          processing_started_at?: string | null
          requested_at?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["data_export_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          download_url?: string | null
          error?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          included_data?: string[]
          notes?: string | null
          processing_started_at?: string | null
          requested_at?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["data_export_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_export_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          decision_id: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          decision_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          decision_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_comments_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_overrides: {
        Row: {
          acted_by: string
          consent_evidence: string
          consent_method: string
          created_at: string
          decision_id: string
          id: string
          option_id: string | null
        }
        Insert: {
          acted_by: string
          consent_evidence: string
          consent_method: string
          created_at?: string
          decision_id: string
          id?: string
          option_id?: string | null
        }
        Update: {
          acted_by?: string
          consent_evidence?: string
          consent_method?: string
          created_at?: string
          decision_id?: string
          id?: string
          option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_overrides_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_overrides_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "client_decision_options"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_applications: {
        Row: {
          additional_info: string | null
          business_name: string | null
          certifications: string[] | null
          created_at: string
          id: string
          portfolio_url: string | null
          referral_source: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialties: string[] | null
          status: Database["public"]["Enums"]["designer_application_status"]
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          additional_info?: string | null
          business_name?: string | null
          certifications?: string[] | null
          created_at?: string
          id?: string
          portfolio_url?: string | null
          referral_source?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialties?: string[] | null
          status?: Database["public"]["Enums"]["designer_application_status"]
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          additional_info?: string | null
          business_name?: string | null
          certifications?: string[] | null
          created_at?: string
          id?: string
          portfolio_url?: string | null
          referral_source?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialties?: string[] | null
          status?: Database["public"]["Enums"]["designer_application_status"]
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      designer_clients: {
        Row: {
          client_email: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          designer_id: string
          first_project_at: string | null
          id: string
          inspiration_quote: string | null
          last_contacted_at: string | null
          last_project_at: string | null
          lead_id: string | null
          location: string | null
          nickname: string | null
          notes: string | null
          preferred_contact: string | null
          referral_source: string | null
          satisfaction_score: number | null
          source: string | null
          status: string
          style_preferences: Json | null
          style_tags: string[] | null
          tags: string[] | null
          total_projects: number | null
          total_revenue: number | null
          updated_at: string
        }
        Insert: {
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          designer_id: string
          first_project_at?: string | null
          id?: string
          inspiration_quote?: string | null
          last_contacted_at?: string | null
          last_project_at?: string | null
          lead_id?: string | null
          location?: string | null
          nickname?: string | null
          notes?: string | null
          preferred_contact?: string | null
          referral_source?: string | null
          satisfaction_score?: number | null
          source?: string | null
          status?: string
          style_preferences?: Json | null
          style_tags?: string[] | null
          tags?: string[] | null
          total_projects?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Update: {
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          designer_id?: string
          first_project_at?: string | null
          id?: string
          inspiration_quote?: string | null
          last_contacted_at?: string | null
          last_project_at?: string | null
          lead_id?: string | null
          location?: string | null
          nickname?: string | null
          notes?: string | null
          preferred_contact?: string | null
          referral_source?: string | null
          satisfaction_score?: number | null
          source?: string | null
          status?: string
          style_preferences?: Json | null
          style_tags?: string[] | null
          tags?: string[] | null
          total_projects?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "designer_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_clients_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_clients_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_earnings: {
        Row: {
          commission_rate: number | null
          created_at: string
          description: string | null
          designer_id: string
          earned_at: string
          gross_amount: number
          id: string
          net_amount: number
          order_id: string | null
          paid_at: string | null
          payout_id: string | null
          platform_fee: number | null
          proposal_id: string | null
          proposal_item_id: string | null
          source_type: string
          status: string
        }
        Insert: {
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          designer_id: string
          earned_at?: string
          gross_amount: number
          id?: string
          net_amount: number
          order_id?: string | null
          paid_at?: string | null
          payout_id?: string | null
          platform_fee?: number | null
          proposal_id?: string | null
          proposal_item_id?: string | null
          source_type: string
          status?: string
        }
        Update: {
          commission_rate?: number | null
          created_at?: string
          description?: string | null
          designer_id?: string
          earned_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          order_id?: string | null
          paid_at?: string | null
          payout_id?: string | null
          platform_fee?: number | null
          proposal_id?: string | null
          proposal_item_id?: string | null
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "designer_earnings_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_earnings_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_earnings_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_earnings_proposal_item_id_fkey"
            columns: ["proposal_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          designer_id: string
          failed_reason: string | null
          id: string
          payment_method: string | null
          payment_reference: string | null
          period_end: string
          period_start: string
          processed_at: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          designer_id: string
          failed_reason?: string | null
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          period_end: string
          period_start: string
          processed_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          designer_id?: string
          failed_reason?: string | null
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          period_end?: string
          period_start?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "designer_payouts_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_payouts_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_teaching_stats: {
        Row: {
          accuracy_score: number | null
          badges: Json | null
          consensus_rate: number | null
          designer_id: string
          id: string
          match_impact_count: number | null
          products_taught: number | null
          total_teaching_minutes: number | null
          updated_at: string | null
          validations_completed: number | null
        }
        Insert: {
          accuracy_score?: number | null
          badges?: Json | null
          consensus_rate?: number | null
          designer_id: string
          id?: string
          match_impact_count?: number | null
          products_taught?: number | null
          total_teaching_minutes?: number | null
          updated_at?: string | null
          validations_completed?: number | null
        }
        Update: {
          accuracy_score?: number | null
          badges?: Json | null
          consensus_rate?: number | null
          designer_id?: string
          id?: string
          match_impact_count?: number | null
          products_taught?: number | null
          total_teaching_minutes?: number | null
          updated_at?: string | null
          validations_completed?: number | null
        }
        Relationships: []
      }
      designer_vendor_accounts: {
        Row: {
          account_number: string | null
          account_since: string | null
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string | null
          current_tier_id: string | null
          designer_id: string
          id: string
          next_tier_id: string | null
          notes: string | null
          sales_rep_email: string | null
          sales_rep_name: string | null
          sales_rep_phone: string | null
          updated_at: string | null
          vendor_id: string
          volume_to_next_tier: number | null
          ytd_volume: number | null
        }
        Insert: {
          account_number?: string | null
          account_since?: string | null
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string | null
          current_tier_id?: string | null
          designer_id: string
          id?: string
          next_tier_id?: string | null
          notes?: string | null
          sales_rep_email?: string | null
          sales_rep_name?: string | null
          sales_rep_phone?: string | null
          updated_at?: string | null
          vendor_id: string
          volume_to_next_tier?: number | null
          ytd_volume?: number | null
        }
        Update: {
          account_number?: string | null
          account_since?: string | null
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string | null
          current_tier_id?: string | null
          designer_id?: string
          id?: string
          next_tier_id?: string | null
          notes?: string | null
          sales_rep_email?: string | null
          sales_rep_name?: string | null
          sales_rep_phone?: string | null
          updated_at?: string | null
          vendor_id?: string
          volume_to_next_tier?: number | null
          ytd_volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_vendor_accounts_current_tier_id_fkey"
            columns: ["current_tier_id"]
            isOneToOne: false
            referencedRelation: "vendor_trade_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_vendor_accounts_next_tier_id_fkey"
            columns: ["next_tier_id"]
            isOneToOne: false
            referencedRelation: "vendor_trade_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_vendor_accounts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      device_pair_sessions: {
        Row: {
          consumed_at: string | null
          created_at: string
          device_info: Json | null
          expires_at: string
          nonce: string
          origin_browser: string | null
          origin_ip: unknown
          origin_os: string | null
          status: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          device_info?: Json | null
          expires_at: string
          nonce: string
          origin_browser?: string | null
          origin_ip?: unknown
          origin_os?: string | null
          status?: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          device_info?: Json | null
          expires_at?: string
          nonce?: string
          origin_browser?: string | null
          origin_ip?: unknown
          origin_os?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      editorial_stories: {
        Row: {
          audience_tags: string[]
          body_md: string | null
          created_at: string
          expires_at: string | null
          featured_product_id: string | null
          hero_gradient_key: string | null
          hero_image_url: string | null
          id: string
          maker_avatar_gradient_key: string | null
          maker_avatar_url: string | null
          maker_location: string | null
          maker_name: string | null
          published_at: string | null
          read_minutes: number
          sort_order: number
          subtitle: string | null
          tag: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_tags?: string[]
          body_md?: string | null
          created_at?: string
          expires_at?: string | null
          featured_product_id?: string | null
          hero_gradient_key?: string | null
          hero_image_url?: string | null
          id?: string
          maker_avatar_gradient_key?: string | null
          maker_avatar_url?: string | null
          maker_location?: string | null
          maker_name?: string | null
          published_at?: string | null
          read_minutes?: number
          sort_order?: number
          subtitle?: string | null
          tag: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_tags?: string[]
          body_md?: string | null
          created_at?: string
          expires_at?: string | null
          featured_product_id?: string | null
          hero_gradient_key?: string | null
          hero_image_url?: string | null
          id?: string
          maker_avatar_gradient_key?: string | null
          maker_avatar_url?: string | null
          maker_location?: string | null
          maker_name?: string | null
          published_at?: string | null
          read_minutes?: number
          sort_order?: number
          subtitle?: string | null
          tag?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_stories_featured_product_id_fkey"
            columns: ["featured_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_stories_featured_product_id_fkey"
            columns: ["featured_product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      email_template_versions: {
        Row: {
          content_blocks: Json | null
          created_at: string
          edited_by: string | null
          html_content: string | null
          id: string
          name: string | null
          subject_default: string | null
          template_id: string
          variables: Json | null
          version_num: number
        }
        Insert: {
          content_blocks?: Json | null
          created_at?: string
          edited_by?: string | null
          html_content?: string | null
          id?: string
          name?: string | null
          subject_default?: string | null
          template_id: string
          variables?: Json | null
          version_num: number
        }
        Update: {
          content_blocks?: Json | null
          created_at?: string
          edited_by?: string | null
          html_content?: string | null
          id?: string
          name?: string | null
          subject_default?: string | null
          template_id?: string
          variables?: Json | null
          version_num?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: Database["public"]["Enums"]["email_template_category"]
          content_blocks: Json
          created_at: string
          created_by: string | null
          description: string | null
          frequency_cap_count: number | null
          frequency_cap_window_days: number | null
          html_content: string
          id: string
          is_active: boolean
          name: string
          slug: string
          subject_default: string | null
          thumbnail_url: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          category: Database["public"]["Enums"]["email_template_category"]
          content_blocks?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          frequency_cap_count?: number | null
          frequency_cap_window_days?: number | null
          html_content?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          subject_default?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          category?: Database["public"]["Enums"]["email_template_category"]
          content_blocks?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          frequency_cap_count?: number | null
          frequency_cap_window_days?: number | null
          html_content?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          subject_default?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_events: {
        Row: {
          created_at: string
          event_name: string
          event_properties: Json | null
          id: string
          platform: string
          posthog_event_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          event_properties?: Json | null
          id?: string
          platform: string
          posthog_event_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          event_properties?: Json | null
          id?: string
          platform?: string
          posthog_event_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_cache_meta: {
        Row: {
          expires_at: string
          generated_at: string
          new_since_last_view: number | null
          products_ranked: string[]
          room_id: string
          user_id: string
        }
        Insert: {
          expires_at: string
          generated_at?: string
          new_since_last_view?: number | null
          products_ranked?: string[]
          room_id: string
          user_id: string
        }
        Update: {
          expires_at?: string
          generated_at?: string
          new_since_last_view?: number | null
          products_ranked?: string[]
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_cache_meta_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_cache_meta_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      ffe_categories: {
        Row: {
          created_at: string
          designer_id: string | null
          icon: string | null
          id: string
          is_system: boolean
          label: string
          parent_id: string | null
          proposal_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          designer_id?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          label: string
          parent_id?: string | null
          proposal_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          designer_id?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          label?: string
          parent_id?: string | null
          proposal_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ffe_categories_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ffe_categories_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ffe_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ffe_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ffe_categories_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      founding_designer_applications: {
        Row: {
          auth_user_id: string | null
          company: string | null
          converted_at: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          location: string | null
          motivation: string | null
          referral_source: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sourcing_process: string | null
          status: Database["public"]["Enums"]["application_review_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          auth_user_id?: string | null
          company?: string | null
          converted_at?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          location?: string | null
          motivation?: string | null
          referral_source?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sourcing_process?: string | null
          status?: Database["public"]["Enums"]["application_review_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          auth_user_id?: string | null
          company?: string | null
          converted_at?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          location?: string | null
          motivation?: string | null
          referral_source?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sourcing_process?: string | null
          status?: Database["public"]["Enums"]["application_review_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      interactions: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          product_id: string
          room_id: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          product_id: string
          room_id?: string | null
          session_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          product_id?: string
          room_id?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          accepted_at: string | null
          budget_range: string | null
          contacted_at: string | null
          created_at: string
          declined_at: string | null
          designer_id: string | null
          homeowner_id: string | null
          id: string
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          match_reasons: Json | null
          match_score: number | null
          project_description: string | null
          project_type: string
          response_deadline: string | null
          room_scan_id: string | null
          status: string
          timeline: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          budget_range?: string | null
          contacted_at?: string | null
          created_at?: string
          declined_at?: string | null
          designer_id?: string | null
          homeowner_id?: string | null
          id?: string
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          match_reasons?: Json | null
          match_score?: number | null
          project_description?: string | null
          project_type: string
          response_deadline?: string | null
          room_scan_id?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          budget_range?: string | null
          contacted_at?: string | null
          created_at?: string
          declined_at?: string | null
          designer_id?: string | null
          homeowner_id?: string | null
          id?: string
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          match_reasons?: Json | null
          match_score?: number | null
          project_description?: string | null
          project_type?: string
          response_deadline?: string | null
          room_scan_id?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_homeowner_id_fkey"
            columns: ["homeowner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_homeowner_id_fkey"
            columns: ["homeowner_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_room_scan_id_fkey"
            columns: ["room_scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_room_scan_id_fkey"
            columns: ["room_scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      maker_applications: {
        Row: {
          auth_user_id: string | null
          brand_name: string
          contact_name: string
          converted_at: string | null
          created_at: string
          description: string | null
          email: string
          id: string
          location: string | null
          materials: string | null
          referral_source: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["application_review_status"]
          trade_program: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          auth_user_id?: string | null
          brand_name: string
          contact_name: string
          converted_at?: string | null
          created_at?: string
          description?: string | null
          email: string
          id?: string
          location?: string | null
          materials?: string | null
          referral_source?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_review_status"]
          trade_program?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          auth_user_id?: string | null
          brand_name?: string
          contact_name?: string
          converted_at?: string | null
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          location?: string | null
          materials?: string | null
          referral_source?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_review_status"]
          trade_program?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      material_compatibility: {
        Row: {
          compatibility: string | null
          created_at: string | null
          id: string
          material_a: string
          material_b: string
          notes: string | null
        }
        Insert: {
          compatibility?: string | null
          created_at?: string | null
          id?: string
          material_a: string
          material_b: string
          notes?: string | null
        }
        Update: {
          compatibility?: string | null
          created_at?: string | null
          id?: string
          material_a?: string
          material_b?: string
          notes?: string | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          clicked_at: string | null
          created_at: string
          error: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          provider_id: string | null
          retry_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          clicked_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          provider_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          clicked_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          provider_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channels_email: boolean
          channels_in_app: boolean
          channels_push: boolean
          channels_sms: boolean
          created_at: string
          digest_frequency: Database["public"]["Enums"]["digest_frequency"]
          id: string
          last_digest_sent_at: string | null
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string
          type_account_security: boolean
          type_back_in_stock: boolean
          type_client_message: boolean
          type_commission_earned: boolean
          type_founding_circle: boolean
          type_lead_expiring: boolean
          type_lead_response: boolean
          type_new_lead: boolean
          type_new_products: boolean
          type_order_confirmation: boolean
          type_payment_receipt: boolean
          type_price_drop: boolean
          type_product_launch: boolean
          type_project_milestone: boolean
          type_reengagement: boolean
          type_seasonal_campaign: boolean
          type_teaching_reminder: boolean
          type_weekly_inspiration: boolean
          type_wishlist_update: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channels_email?: boolean
          channels_in_app?: boolean
          channels_push?: boolean
          channels_sms?: boolean
          created_at?: string
          digest_frequency?: Database["public"]["Enums"]["digest_frequency"]
          id?: string
          last_digest_sent_at?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          type_account_security?: boolean
          type_back_in_stock?: boolean
          type_client_message?: boolean
          type_commission_earned?: boolean
          type_founding_circle?: boolean
          type_lead_expiring?: boolean
          type_lead_response?: boolean
          type_new_lead?: boolean
          type_new_products?: boolean
          type_order_confirmation?: boolean
          type_payment_receipt?: boolean
          type_price_drop?: boolean
          type_product_launch?: boolean
          type_project_milestone?: boolean
          type_reengagement?: boolean
          type_seasonal_campaign?: boolean
          type_teaching_reminder?: boolean
          type_weekly_inspiration?: boolean
          type_wishlist_update?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channels_email?: boolean
          channels_in_app?: boolean
          channels_push?: boolean
          channels_sms?: boolean
          created_at?: string
          digest_frequency?: Database["public"]["Enums"]["digest_frequency"]
          id?: string
          last_digest_sent_at?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string
          type_account_security?: boolean
          type_back_in_stock?: boolean
          type_client_message?: boolean
          type_commission_earned?: boolean
          type_founding_circle?: boolean
          type_lead_expiring?: boolean
          type_lead_response?: boolean
          type_new_lead?: boolean
          type_new_products?: boolean
          type_order_confirmation?: boolean
          type_payment_receipt?: boolean
          type_price_drop?: boolean
          type_product_launch?: boolean
          type_project_milestone?: boolean
          type_reengagement?: boolean
          type_seasonal_campaign?: boolean
          type_teaching_reminder?: boolean
          type_weekly_inspiration?: boolean
          type_wishlist_update?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_accounts: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["oauth_provider"]
          provider_account_id: string
          provider_email: string | null
          provider_name: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          provider: Database["public"]["Enums"]["oauth_provider"]
          provider_account_id: string
          provider_email?: string | null
          provider_name?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["oauth_provider"]
          provider_account_id?: string
          provider_email?: string | null
          provider_name?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invitation_expires_at: string | null
          invitation_token: string | null
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          permissions_override: Json | null
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          permissions_override?: Json | null
          role: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          permissions_override?: Json | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json | null
          business_verified: boolean
          business_verified_at: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          subscription_expires_at: string | null
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          tax_id: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: Json | null
          business_verified?: boolean
          business_verified_at?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["organization_status"]
          subscription_expires_at?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          tax_id?: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: Json | null
          business_verified?: boolean
          business_verified_at?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["organization_status"]
          subscription_expires_at?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          tax_id?: string | null
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      paint_colors: {
        Row: {
          brand: string
          code: string
          created_at: string
          family: string | null
          hex: string
          id: string
          lrv: number | null
          name: string
          search_vector: unknown
        }
        Insert: {
          brand: string
          code: string
          created_at?: string
          family?: string | null
          hex: string
          id?: string
          lrv?: number | null
          name: string
          search_vector?: unknown
        }
        Update: {
          brand?: string
          code?: string
          created_at?: string
          family?: string | null
          hex?: string
          id?: string
          lrv?: number | null
          name?: string
          search_vector?: unknown
        }
        Relationships: []
      }
      palette_swatches: {
        Row: {
          brand: string | null
          brand_code: string | null
          created_at: string
          hex: string
          id: string
          name: string | null
          paint_color_id: string | null
          palette_id: string
          role: string | null
          sort_order: number
          source_pixel: Json | null
        }
        Insert: {
          brand?: string | null
          brand_code?: string | null
          created_at?: string
          hex: string
          id?: string
          name?: string | null
          paint_color_id?: string | null
          palette_id: string
          role?: string | null
          sort_order?: number
          source_pixel?: Json | null
        }
        Update: {
          brand?: string | null
          brand_code?: string | null
          created_at?: string
          hex?: string
          id?: string
          name?: string | null
          paint_color_id?: string | null
          palette_id?: string
          role?: string | null
          sort_order?: number
          source_pixel?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "palette_swatches_paint_color_fk"
            columns: ["paint_color_id"]
            isOneToOne: false
            referencedRelation: "paint_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "palette_swatches_palette_id_fkey"
            columns: ["palette_id"]
            isOneToOne: false
            referencedRelation: "proposal_palettes"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          name: string
          resource: string
          scope: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          resource: string
          scope?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          resource?: string
          scope?: string | null
        }
        Relationships: []
      }
      phase_templates: {
        Row: {
          created_at: string
          description: string | null
          designer_id: string | null
          id: string
          is_system: boolean
          label: string
          phases: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          designer_id?: string | null
          id?: string
          is_system?: boolean
          label: string
          phases: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          designer_id?: string | null
          id?: string
          is_system?: boolean
          label?: string
          phases?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_templates_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_templates_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_vendor_scores: {
        Row: {
          data_sources: string[] | null
          dimension: number
          dimension_name: string
          evidence: string | null
          id: string
          raw_score: number | null
          scored_at: string | null
          scored_by: string
          vendor_id: string
          weight: number
          weighted_score: number | null
        }
        Insert: {
          data_sources?: string[] | null
          dimension: number
          dimension_name: string
          evidence?: string | null
          id?: string
          raw_score?: number | null
          scored_at?: string | null
          scored_by: string
          vendor_id: string
          weight: number
          weighted_score?: number | null
        }
        Update: {
          data_sources?: string[] | null
          dimension?: number
          dimension_name?: string
          evidence?: string | null
          id?: string
          raw_score?: number | null
          scored_at?: string | null
          scored_by?: string
          vendor_id?: string
          weight?: number
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_vendor_scores_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "pipeline_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_vendors: {
        Row: {
          awaiting_leah_review: boolean | null
          company_size: string | null
          created_at: string
          data_format: string | null
          drop_ship_capable: boolean | null
          feed_frequency: string | null
          feed_url: string | null
          has_hard_veto: boolean | null
          id: string
          last_feed_sync_at: string | null
          leah_notes: string | null
          location_city: string | null
          location_country: string | null
          location_state: string | null
          name: string
          notes: string | null
          payment_terms: string | null
          price_range_high: number | null
          price_range_low: number | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          primary_contact_role: string | null
          product_categories: string[] | null
          scored_by_kody: boolean | null
          scored_by_leah: boolean | null
          slug: string
          source: string | null
          stage: string
          stage_changed_at: string | null
          total_score: number | null
          trade_account_status: string | null
          trade_discount_pct: number | null
          triage_level: string | null
          updated_at: string
          veto_reason: string | null
          website_url: string | null
          year_established: number | null
        }
        Insert: {
          awaiting_leah_review?: boolean | null
          company_size?: string | null
          created_at?: string
          data_format?: string | null
          drop_ship_capable?: boolean | null
          feed_frequency?: string | null
          feed_url?: string | null
          has_hard_veto?: boolean | null
          id?: string
          last_feed_sync_at?: string | null
          leah_notes?: string | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          price_range_high?: number | null
          price_range_low?: number | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_role?: string | null
          product_categories?: string[] | null
          scored_by_kody?: boolean | null
          scored_by_leah?: boolean | null
          slug: string
          source?: string | null
          stage?: string
          stage_changed_at?: string | null
          total_score?: number | null
          trade_account_status?: string | null
          trade_discount_pct?: number | null
          triage_level?: string | null
          updated_at?: string
          veto_reason?: string | null
          website_url?: string | null
          year_established?: number | null
        }
        Update: {
          awaiting_leah_review?: boolean | null
          company_size?: string | null
          created_at?: string
          data_format?: string | null
          drop_ship_capable?: boolean | null
          feed_frequency?: string | null
          feed_url?: string | null
          has_hard_veto?: boolean | null
          id?: string
          last_feed_sync_at?: string | null
          leah_notes?: string | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          price_range_high?: number | null
          price_range_low?: number | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_role?: string | null
          product_categories?: string[] | null
          scored_by_kody?: boolean | null
          scored_by_leah?: boolean | null
          slug?: string
          source?: string | null
          stage?: string
          stage_changed_at?: string | null
          total_score?: number | null
          trade_account_status?: string | null
          trade_discount_pct?: number | null
          triage_level?: string | null
          updated_at?: string
          veto_reason?: string | null
          website_url?: string | null
          year_established?: number | null
        }
        Relationships: []
      }
      po_payments: {
        Row: {
          amount_cents: number
          created_at: string
          due_date: string | null
          id: string
          kind: Database["public"]["Enums"]["po_payment_kind"]
          label: string | null
          notes: string | null
          paid_date: string | null
          purchase_order_id: string
          sort_order: number
          state: Database["public"]["Enums"]["po_payment_state"]
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          due_date?: string | null
          id?: string
          kind: Database["public"]["Enums"]["po_payment_kind"]
          label?: string | null
          notes?: string | null
          paid_date?: string | null
          purchase_order_id: string
          sort_order?: number
          state?: Database["public"]["Enums"]["po_payment_state"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["po_payment_kind"]
          label?: string | null
          notes?: string | null
          paid_date?: string | null
          purchase_order_id?: string
          sort_order?: number
          state?: Database["public"]["Enums"]["po_payment_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_notifications: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["procurement_notification_kind"]
          read_at: string | null
          subject_inspection_id: string | null
          subject_payment_id: string | null
          subject_purchase_order_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["procurement_notification_kind"]
          read_at?: string | null
          subject_inspection_id?: string | null
          subject_payment_id?: string | null
          subject_purchase_order_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["procurement_notification_kind"]
          read_at?: string | null
          subject_inspection_id?: string | null
          subject_payment_id?: string | null
          subject_purchase_order_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_notifications_subject_inspection_id_fkey"
            columns: ["subject_inspection_id"]
            isOneToOne: false
            referencedRelation: "receiving_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_notifications_subject_payment_id_fkey"
            columns: ["subject_payment_id"]
            isOneToOne: false
            referencedRelation: "po_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_notifications_subject_purchase_order_id_fkey"
            columns: ["subject_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_appeal_signals: {
        Row: {
          appeal_signal_id: string
          assigned_by: string
          created_at: string | null
          id: string
          product_id: string
        }
        Insert: {
          appeal_signal_id: string
          assigned_by: string
          created_at?: string | null
          id?: string
          product_id: string
        }
        Update: {
          appeal_signal_id?: string
          assigned_by?: string
          created_at?: string | null
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_appeal_signals_appeal_signal_id_fkey"
            columns: ["appeal_signal_id"]
            isOneToOne: false
            referencedRelation: "appeal_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_appeal_signals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_appeal_signals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_client_matches: {
        Row: {
          archetype_id: string
          assigned_by: string
          created_at: string | null
          id: string
          is_avoidance: boolean | null
          match_strength: number | null
          notes: string | null
          product_id: string
        }
        Insert: {
          archetype_id: string
          assigned_by: string
          created_at?: string | null
          id?: string
          is_avoidance?: boolean | null
          match_strength?: number | null
          notes?: string | null
          product_id: string
        }
        Update: {
          archetype_id?: string
          assigned_by?: string
          created_at?: string | null
          id?: string
          is_avoidance?: boolean | null
          match_strength?: number | null
          notes?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_client_matches_archetype_id_fkey"
            columns: ["archetype_id"]
            isOneToOne: false
            referencedRelation: "client_archetypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_client_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_client_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_engagement: {
        Row: {
          add_to_room_rate: number | null
          avg_dwell_ms: number | null
          avg_match_when_shown: number | null
          declining_flag: boolean | null
          detail_open_rate: number | null
          product_id: string
          save_rate: number | null
          share_rate: number | null
          total_dwell_ms: number | null
          total_impressions: number | null
          updated_at: string | null
        }
        Insert: {
          add_to_room_rate?: number | null
          avg_dwell_ms?: number | null
          avg_match_when_shown?: number | null
          declining_flag?: boolean | null
          detail_open_rate?: number | null
          product_id: string
          save_rate?: number | null
          share_rate?: number | null
          total_dwell_ms?: number | null
          total_impressions?: number | null
          updated_at?: string | null
        }
        Update: {
          add_to_room_rate?: number | null
          avg_dwell_ms?: number | null
          avg_match_when_shown?: number | null
          declining_flag?: boolean | null
          detail_open_rate?: number | null
          product_id?: string
          save_rate?: number | null
          share_rate?: number | null
          total_dwell_ms?: number | null
          total_impressions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_engagement_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_engagement_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_inventory: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity_available: number
          restock_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity_available?: number
          restock_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity_available?: number
          restock_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_relations: {
        Row: {
          assigned_by: string
          created_at: string | null
          id: string
          notes: string | null
          product_a_id: string
          product_b_id: string
          relation_type: Database["public"]["Enums"]["relation_type"]
        }
        Insert: {
          assigned_by: string
          created_at?: string | null
          id?: string
          notes?: string | null
          product_a_id: string
          product_b_id: string
          relation_type: Database["public"]["Enums"]["relation_type"]
        }
        Update: {
          assigned_by?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          product_a_id?: string
          product_b_id?: string
          relation_type?: Database["public"]["Enums"]["relation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_product_a_id_fkey"
            columns: ["product_a_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_product_a_id_fkey"
            columns: ["product_a_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_b_id_fkey"
            columns: ["product_b_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_product_b_id_fkey"
            columns: ["product_b_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_style_spectrum: {
        Row: {
          assigned_by: string
          boldness: number | null
          complexity: number | null
          craftsmanship: number | null
          created_at: string | null
          formality: number | null
          id: string
          product_id: string
          timelessness: number | null
          updated_at: string | null
          warmth: number | null
        }
        Insert: {
          assigned_by: string
          boldness?: number | null
          complexity?: number | null
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          id?: string
          product_id: string
          timelessness?: number | null
          updated_at?: string | null
          warmth?: number | null
        }
        Update: {
          assigned_by?: string
          boldness?: number | null
          complexity?: number | null
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          id?: string
          product_id?: string
          timelessness?: number | null
          updated_at?: string | null
          warmth?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_style_spectrum_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_style_spectrum_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_styles: {
        Row: {
          assigned_by: string
          confidence: number | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          product_id: string
          source: string | null
          style_id: string
        }
        Insert: {
          assigned_by: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          product_id: string
          source?: string | null
          style_id: string
        }
        Update: {
          assigned_by?: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          product_id?: string
          source?: string | null
          style_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_styles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_styles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_styles_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_user_dwell: {
        Row: {
          avg_visibility_pct: number | null
          computed_interest_score: number | null
          id: string
          last_seen: string | null
          max_single_dwell_ms: number | null
          product_id: string
          total_dwell_ms: number | null
          updated_at: string | null
          user_id: string
          view_count: number | null
        }
        Insert: {
          avg_visibility_pct?: number | null
          computed_interest_score?: number | null
          id?: string
          last_seen?: string | null
          max_single_dwell_ms?: number | null
          product_id: string
          total_dwell_ms?: number | null
          updated_at?: string | null
          user_id: string
          view_count?: number | null
        }
        Update: {
          avg_visibility_pct?: number | null
          computed_interest_score?: number | null
          id?: string
          last_seen?: string | null
          max_single_dwell_ms?: number | null
          product_id?: string
          total_dwell_ms?: number | null
          updated_at?: string | null
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_user_dwell_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_user_dwell_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          aesthete_vector: string | null
          available_colors: string[] | null
          brand: string | null
          captured_at: string
          captured_by: string | null
          catalog_equivalent_id: string | null
          category: string | null
          colors: string[] | null
          commission_rate: number | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          dimensions: Json | null
          embedding: string | null
          embedding_updated_at: string | null
          finish: string | null
          id: string
          images: string[] | null
          layer: string
          lead_time_weeks: number | null
          material_tags: string[] | null
          materials: string[] | null
          merged_into_id: string | null
          name: string
          owner_user_id: string | null
          patina_managed: boolean
          payment_terms:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          price_retail: number | null
          price_trade: number | null
          promoted_at: string | null
          promoted_by: string | null
          promoted_from_id: string | null
          published_at: string | null
          quality_score: number | null
          retailer_id: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          short_description: string | null
          sku: string | null
          slug: string | null
          source_url: string | null
          status: string
          studio_id: string | null
          style_tags: string[] | null
          subcategory: string | null
          tags: string[] | null
          updated_at: string | null
          usage_notes: string | null
          vendor_contact: Json | null
          vendor_id: string | null
        }
        Insert: {
          aesthete_vector?: string | null
          available_colors?: string[] | null
          brand?: string | null
          captured_at: string
          captured_by?: string | null
          catalog_equivalent_id?: string | null
          category?: string | null
          colors?: string[] | null
          commission_rate?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          dimensions?: Json | null
          embedding?: string | null
          embedding_updated_at?: string | null
          finish?: string | null
          id?: string
          images?: string[] | null
          layer: string
          lead_time_weeks?: number | null
          material_tags?: string[] | null
          materials?: string[] | null
          merged_into_id?: string | null
          name: string
          owner_user_id?: string | null
          patina_managed?: boolean
          payment_terms?:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          price_retail?: number | null
          price_trade?: number | null
          promoted_at?: string | null
          promoted_by?: string | null
          promoted_from_id?: string | null
          published_at?: string | null
          quality_score?: number | null
          retailer_id?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          source_url?: string | null
          status?: string
          studio_id?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          tags?: string[] | null
          updated_at?: string | null
          usage_notes?: string | null
          vendor_contact?: Json | null
          vendor_id?: string | null
        }
        Update: {
          aesthete_vector?: string | null
          available_colors?: string[] | null
          brand?: string | null
          captured_at?: string
          captured_by?: string | null
          catalog_equivalent_id?: string | null
          category?: string | null
          colors?: string[] | null
          commission_rate?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          dimensions?: Json | null
          embedding?: string | null
          embedding_updated_at?: string | null
          finish?: string | null
          id?: string
          images?: string[] | null
          layer?: string
          lead_time_weeks?: number | null
          material_tags?: string[] | null
          materials?: string[] | null
          merged_into_id?: string | null
          name?: string
          owner_user_id?: string | null
          patina_managed?: boolean
          payment_terms?:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          price_retail?: number | null
          price_trade?: number | null
          promoted_at?: string | null
          promoted_by?: string | null
          promoted_from_id?: string | null
          published_at?: string | null
          quality_score?: number | null
          retailer_id?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          source_url?: string | null
          status?: string
          studio_id?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          tags?: string[] | null
          updated_at?: string | null
          usage_notes?: string | null
          vendor_contact?: Json | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_catalog_equivalent_id_fkey"
            columns: ["catalog_equivalent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_catalog_equivalent_id_fkey"
            columns: ["catalog_equivalent_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_promoted_by_fkey"
            columns: ["promoted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_promoted_by_fkey"
            columns: ["promoted_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_promoted_from_id_fkey"
            columns: ["promoted_from_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_promoted_from_id_fkey"
            columns: ["promoted_from_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          behavioral_tracking_opt_out: boolean
          bio: string | null
          business_name: string | null
          city: string | null
          created_at: string
          display_name: string | null
          email: string | null
          email_bounce_count: number | null
          email_complaint: boolean | null
          email_suppressed: boolean | null
          email_suppressed_at: string | null
          extension_user_id: string | null
          full_name: string | null
          help_state: Json
          id: string
          ios_device_id: string | null
          is_designer: boolean | null
          is_verified: boolean | null
          last_active_at: string | null
          mfa_enforced: boolean
          original_source: string | null
          original_utm: Json | null
          phone: string | null
          posthog_distinct_id: string | null
          role: string
          state: string | null
          total_engagement_score: number | null
          updated_at: string
          verified_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          avatar_url?: string | null
          behavioral_tracking_opt_out?: boolean
          bio?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_bounce_count?: number | null
          email_complaint?: boolean | null
          email_suppressed?: boolean | null
          email_suppressed_at?: string | null
          extension_user_id?: string | null
          full_name?: string | null
          help_state?: Json
          id: string
          ios_device_id?: string | null
          is_designer?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          mfa_enforced?: boolean
          original_source?: string | null
          original_utm?: Json | null
          phone?: string | null
          posthog_distinct_id?: string | null
          role?: string
          state?: string | null
          total_engagement_score?: number | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          avatar_url?: string | null
          behavioral_tracking_opt_out?: boolean
          bio?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          email_bounce_count?: number | null
          email_complaint?: boolean | null
          email_suppressed?: boolean | null
          email_suppressed_at?: string | null
          extension_user_id?: string | null
          full_name?: string | null
          help_state?: Json
          id?: string
          ios_device_id?: string | null
          is_designer?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          mfa_enforced?: boolean
          original_source?: string | null
          original_utm?: Json | null
          phone?: string | null
          posthog_distinct_id?: string | null
          role?: string
          state?: string | null
          total_engagement_score?: number | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      project_change_order_templates: {
        Row: {
          created_at: string
          default_fields: Json
          description: string | null
          designer_id: string | null
          id: string
          is_built_in: boolean | null
          name: string
          studio_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_fields?: Json
          description?: string | null
          designer_id?: string | null
          id?: string
          is_built_in?: boolean | null
          name: string
          studio_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_fields?: Json
          description?: string | null
          designer_id?: string | null
          id?: string
          is_built_in?: boolean | null
          name?: string
          studio_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_change_order_templates_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_change_order_templates_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_change_order_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_change_order_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
        ]
      }
      project_ffe_items: {
        Row: {
          blocked: boolean | null
          blocked_by_decision_id: string | null
          blocked_reason: string | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          created_at: string
          eta: string | null
          ffe_category: string | null
          id: string
          item_type: string
          last_status_change_at: string | null
          line_total_cents: number | null
          name: string
          notes: string | null
          po_number: string | null
          product_id: string | null
          project_id: string
          project_room_id: string | null
          purchase_order_id: string | null
          quantity: number
          received_quantity: number | null
          sort_order: number
          source_proposal_item_id: string | null
          status: string
          unit_price_cents: number | null
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          blocked?: boolean | null
          blocked_by_decision_id?: string | null
          blocked_reason?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          eta?: string | null
          ffe_category?: string | null
          id?: string
          item_type?: string
          last_status_change_at?: string | null
          line_total_cents?: number | null
          name: string
          notes?: string | null
          po_number?: string | null
          product_id?: string | null
          project_id: string
          project_room_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          received_quantity?: number | null
          sort_order?: number
          source_proposal_item_id?: string | null
          status?: string
          unit_price_cents?: number | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          blocked?: boolean | null
          blocked_by_decision_id?: string | null
          blocked_reason?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          eta?: string | null
          ffe_category?: string | null
          id?: string
          item_type?: string
          last_status_change_at?: string | null
          line_total_cents?: number | null
          name?: string
          notes?: string | null
          po_number?: string | null
          product_id?: string | null
          project_id?: string
          project_room_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          received_quantity?: number | null
          sort_order?: number
          source_proposal_item_id?: string | null
          status?: string
          unit_price_cents?: number | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ffe_items_purchase_order"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ffe_items_blocked_by_decision_id_fkey"
            columns: ["blocked_by_decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ffe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ffe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "project_ffe_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ffe_items_project_room_id_fkey"
            columns: ["project_room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ffe_items_source_proposal_item_id_fkey"
            columns: ["source_proposal_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
        ]
      }
      project_narrative_sections: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json | null
          project_id: string
          sort_order: number
          source_section_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          project_id: string
          sort_order?: number
          source_section_id?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          sort_order?: number
          source_section_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_narrative_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_narrative_sections_source_section_id_fkey"
            columns: ["source_section_id"]
            isOneToOne: false
            referencedRelation: "proposal_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      project_palettes: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          project_id: string
          scope_room_id: string | null
          sort_order: number
          source_image_url: string | null
          source_palette_id: string | null
          swatches: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          project_id: string
          scope_room_id?: string | null
          sort_order?: number
          source_image_url?: string | null
          source_palette_id?: string | null
          swatches?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          project_id?: string
          scope_room_id?: string | null
          sort_order?: number
          source_image_url?: string | null
          source_palette_id?: string | null
          swatches?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_palettes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_palettes_scope_room_id_fkey"
            columns: ["scope_room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_palettes_source_palette_id_fkey"
            columns: ["source_palette_id"]
            isOneToOne: false
            referencedRelation: "proposal_palettes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_payment_milestones: {
        Row: {
          amount_cents: number
          created_at: string
          due_date: string | null
          id: string
          label: string
          paid_at: string | null
          percentage: number
          phase_id: string | null
          project_id: string
          sort_order: number
          status: string
          stripe_session_id: string | null
          trigger_condition: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          due_date?: string | null
          id?: string
          label: string
          paid_at?: string | null
          percentage: number
          phase_id?: string | null
          project_id: string
          sort_order?: number
          status?: string
          stripe_session_id?: string | null
          trigger_condition?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          paid_at?: string | null
          percentage?: number
          phase_id?: string | null
          project_id?: string
          sort_order?: number
          status?: string
          stripe_session_id?: string | null
          trigger_condition?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_payment_milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_payment_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          completed_at: string | null
          created_at: string
          deliverables: Json | null
          duration_weeks: number | null
          fee_cents: number | null
          gate_condition: string | null
          id: string
          name: string
          phase_key: string | null
          progress: number | null
          project_id: string
          revision_limit: number | null
          revisions_used: number | null
          sort_order: number
          source_proposal_phase_id: string | null
          start_date: string | null
          status: string
          target_end_date: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deliverables?: Json | null
          duration_weeks?: number | null
          fee_cents?: number | null
          gate_condition?: string | null
          id?: string
          name: string
          phase_key?: string | null
          progress?: number | null
          project_id: string
          revision_limit?: number | null
          revisions_used?: number | null
          sort_order?: number
          source_proposal_phase_id?: string | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deliverables?: Json | null
          duration_weeks?: number | null
          fee_cents?: number | null
          gate_condition?: string | null
          id?: string
          name?: string
          phase_key?: string | null
          progress?: number | null
          project_id?: string
          revision_limit?: number | null
          revisions_used?: number | null
          sort_order?: number
          source_proposal_phase_id?: string | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_phases_source_proposal_phase_id_fkey"
            columns: ["source_proposal_phase_id"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      project_products: {
        Row: {
          added_at: string | null
          id: string
          notes: string | null
          position: number | null
          product_id: string
          project_id: string
          section_id: string | null
        }
        Insert: {
          added_at?: string | null
          id?: string
          notes?: string | null
          position?: number | null
          product_id: string
          project_id: string
          section_id?: string | null
        }
        Update: {
          added_at?: string | null
          id?: string
          notes?: string | null
          position?: number | null
          product_id?: string
          project_id?: string
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "project_products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_products_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "project_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      project_rooms: {
        Row: {
          actual_cents: number | null
          budget_cents: number
          committed_cents: number | null
          created_at: string
          dimensions: string | null
          ffe_categories: string[] | null
          floor_area_sqft: number | null
          id: string
          name: string
          notes: string | null
          project_id: string
          room_id: string | null
          room_type: string | null
          sort_order: number
          source_scope_room_id: string | null
          updated_at: string
        }
        Insert: {
          actual_cents?: number | null
          budget_cents?: number
          committed_cents?: number | null
          created_at?: string
          dimensions?: string | null
          ffe_categories?: string[] | null
          floor_area_sqft?: number | null
          id?: string
          name: string
          notes?: string | null
          project_id: string
          room_id?: string | null
          room_type?: string | null
          sort_order?: number
          source_scope_room_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_cents?: number | null
          budget_cents?: number
          committed_cents?: number | null
          created_at?: string
          dimensions?: string | null
          ffe_categories?: string[] | null
          floor_area_sqft?: number | null
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          room_id?: string | null
          room_type?: string | null
          sort_order?: number
          source_scope_room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_rooms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_rooms_source_scope_room_id_fkey"
            columns: ["source_scope_room_id"]
            isOneToOne: false
            referencedRelation: "proposal_scope_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sections: {
        Row: {
          created_at: string | null
          id: string
          name: string
          position: number | null
          project_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          position?: number | null
          project_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          position?: number | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_team_members: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          permissions: Json | null
          project_id: string
          removed_at: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          permissions?: Json | null
          project_id: string
          removed_at?: string | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          permissions?: Json | null
          project_id?: string
          removed_at?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_cents: number | null
          brief_document_url: string | null
          budget_cents: number | null
          budget_max: number | null
          budget_min: number | null
          change_order_terms: Json | null
          client_id: string | null
          client_profile_id: string | null
          client_visibility_tier: string
          committed_cents: number | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          current_phase: string | null
          design_fee_cents: number | null
          designer_id: string | null
          expected_completion_date: string | null
          id: string
          kickoff_date: string | null
          kickoff_message: string | null
          lead_designer_id: string | null
          name: string
          notes: string | null
          proposal_id: string | null
          scope_boundaries: Json | null
          share_token: string | null
          site_address: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          studio_id: string | null
          target_end_date: string | null
          timeline_end: string | null
          timeline_start: string | null
          total_amount_cents: number | null
          updated_at: string | null
        }
        Insert: {
          actual_cents?: number | null
          brief_document_url?: string | null
          budget_cents?: number | null
          budget_max?: number | null
          budget_min?: number | null
          change_order_terms?: Json | null
          client_id?: string | null
          client_profile_id?: string | null
          client_visibility_tier?: string
          committed_cents?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          current_phase?: string | null
          design_fee_cents?: number | null
          designer_id?: string | null
          expected_completion_date?: string | null
          id?: string
          kickoff_date?: string | null
          kickoff_message?: string | null
          lead_designer_id?: string | null
          name: string
          notes?: string | null
          proposal_id?: string | null
          scope_boundaries?: Json | null
          share_token?: string | null
          site_address?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          studio_id?: string | null
          target_end_date?: string | null
          timeline_end?: string | null
          timeline_start?: string | null
          total_amount_cents?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_cents?: number | null
          brief_document_url?: string | null
          budget_cents?: number | null
          budget_max?: number | null
          budget_min?: number | null
          change_order_terms?: Json | null
          client_id?: string | null
          client_profile_id?: string | null
          client_visibility_tier?: string
          committed_cents?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          current_phase?: string | null
          design_fee_cents?: number | null
          designer_id?: string | null
          expected_completion_date?: string | null
          id?: string
          kickoff_date?: string | null
          kickoff_message?: string | null
          lead_designer_id?: string | null
          name?: string
          notes?: string | null
          proposal_id?: string | null
          scope_boundaries?: Json | null
          share_token?: string | null
          site_address?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          studio_id?: string | null
          target_end_date?: string | null
          timeline_end?: string | null
          timeline_start?: string | null
          total_amount_cents?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_projects_client_profile"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_audit_log: {
        Row: {
          action_type: string
          actor_user_id: string | null
          created_at: string
          field_snapshot: Json | null
          from_layer: string
          id: string
          merged_into_id: string | null
          product_id: string
          to_layer: string
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          created_at?: string
          field_snapshot?: Json | null
          from_layer: string
          id?: string
          merged_into_id?: string | null
          product_id: string
          to_layer: string
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          created_at?: string
          field_snapshot?: Json | null
          from_layer?: string
          id?: string
          merged_into_id?: string | null
          product_id?: string
          to_layer?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_audit_log_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_audit_log_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "promotion_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      proposal_captures: {
        Row: {
          captured_at: string
          consumed_at: string | null
          consumed_proposal_item_id: string | null
          designer_id: string
          ffe_category_slug: string | null
          id: string
          product_id: string | null
          proposal_id: string | null
          raw_payload: Json
          scope_room_id: string | null
          source_url: string
          status: string
          thumbnail_url: string | null
        }
        Insert: {
          captured_at?: string
          consumed_at?: string | null
          consumed_proposal_item_id?: string | null
          designer_id: string
          ffe_category_slug?: string | null
          id?: string
          product_id?: string | null
          proposal_id?: string | null
          raw_payload?: Json
          scope_room_id?: string | null
          source_url: string
          status?: string
          thumbnail_url?: string | null
        }
        Update: {
          captured_at?: string
          consumed_at?: string | null
          consumed_proposal_item_id?: string | null
          designer_id?: string
          ffe_category_slug?: string | null
          id?: string
          product_id?: string | null
          proposal_id?: string | null
          raw_payload?: Json
          scope_room_id?: string | null
          source_url?: string
          status?: string
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_captures_consumed_proposal_item_id_fkey"
            columns: ["consumed_proposal_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_captures_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_captures_scope_room_id_fkey"
            columns: ["scope_room_id"]
            isOneToOne: false
            referencedRelation: "proposal_scope_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_change_order_terms: {
        Row: {
          approval_required: boolean | null
          created_at: string
          hourly_rate_cents: number | null
          id: string
          minimum_fee_cents: number | null
          process_description: string
          proposal_id: string
          updated_at: string
        }
        Insert: {
          approval_required?: boolean | null
          created_at?: string
          hourly_rate_cents?: number | null
          id?: string
          minimum_fee_cents?: number | null
          process_description: string
          proposal_id: string
          updated_at?: string
        }
        Update: {
          approval_required?: boolean | null
          created_at?: string
          hourly_rate_cents?: number | null
          id?: string
          minimum_fee_cents?: number | null
          process_description?: string
          proposal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_change_order_terms_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_engagement: {
        Row: {
          created_at: string
          duration_seconds: number | null
          event_type: string
          id: string
          metadata: Json | null
          proposal_id: string
          section_type: string | null
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          event_type: string
          id?: string
          metadata?: Json | null
          proposal_id: string
          section_type?: string | null
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          event_type?: string
          id?: string
          metadata?: Json | null
          proposal_id?: string
          section_type?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_engagement_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_engagement_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_engagement_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_exclusions: {
        Row: {
          category: string | null
          created_at: string
          description: string
          id: string
          proposal_id: string
          sort_order: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          id?: string
          proposal_id: string
          sort_order?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          proposal_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_exclusions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          budget_max_cents: number | null
          budget_min_cents: number | null
          category: string | null
          created_at: string
          description: string | null
          ffe_category: string | null
          id: string
          image_url: string | null
          internal_notes: string | null
          item_type: string
          lead_time_weeks: number | null
          line_total_cents: number
          markup_percent: number | null
          name: string
          notes: string | null
          position: number
          product_id: string | null
          proposal_id: string
          quantity: number
          room: string | null
          scope_room_id: string | null
          unit_price: number
          unit_sell_price: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          ffe_category?: string | null
          id?: string
          image_url?: string | null
          internal_notes?: string | null
          item_type?: string
          lead_time_weeks?: number | null
          line_total_cents: number
          markup_percent?: number | null
          name: string
          notes?: string | null
          position?: number
          product_id?: string | null
          proposal_id: string
          quantity?: number
          room?: string | null
          scope_room_id?: string | null
          unit_price: number
          unit_sell_price: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          ffe_category?: string | null
          id?: string
          image_url?: string | null
          internal_notes?: string | null
          item_type?: string
          lead_time_weeks?: number | null
          line_total_cents?: number
          markup_percent?: number | null
          name?: string
          notes?: string | null
          position?: number
          product_id?: string | null
          proposal_id?: string
          quantity?: number
          room?: string | null
          scope_room_id?: string | null
          unit_price?: number
          unit_sell_price?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_scope_room_id_fkey"
            columns: ["scope_room_id"]
            isOneToOne: false
            referencedRelation: "proposal_scope_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_palettes: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          proposal_id: string
          scope_room_id: string | null
          sort_order: number
          source_image_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          proposal_id: string
          scope_room_id?: string | null
          sort_order?: number
          source_image_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          proposal_id?: string
          scope_room_id?: string | null
          sort_order?: number
          source_image_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_palettes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_palettes_scope_room_id_fkey"
            columns: ["scope_room_id"]
            isOneToOne: false
            referencedRelation: "proposal_scope_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_payment_milestones: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          label: string
          percentage: number
          phase_id: string | null
          proposal_id: string
          sort_order: number
          trigger_condition: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          label: string
          percentage: number
          phase_id?: string | null
          proposal_id: string
          sort_order?: number
          trigger_condition?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          label?: string
          percentage?: number
          phase_id?: string | null
          proposal_id?: string
          sort_order?: number
          trigger_condition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_payment_milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_payment_milestones_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_phase_deliverables: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          label: string
          phase_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          label: string
          phase_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          label?: string
          phase_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_phase_deliverables_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_phase_deliverables_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_phase_deliverables_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_phase_gates: {
        Row: {
          created_at: string
          gate_kind: string
          id: string
          override_reason: string | null
          payload: Json
          phase_id: string
          satisfied_at: string | null
          satisfied_by: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          gate_kind: string
          id?: string
          override_reason?: string | null
          payload?: Json
          phase_id: string
          satisfied_at?: string | null
          satisfied_by?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          gate_kind?: string
          id?: string
          override_reason?: string | null
          payload?: Json
          phase_id?: string
          satisfied_at?: string | null
          satisfied_by?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_phase_gates_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_phase_gates_satisfied_by_fkey"
            columns: ["satisfied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_phase_gates_satisfied_by_fkey"
            columns: ["satisfied_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_phases: {
        Row: {
          created_at: string
          deliverables: Json | null
          duration_weeks: number | null
          fee_cents: number
          gate_condition: string | null
          id: string
          name: string
          phase_key: string | null
          proposal_id: string
          revision_limit: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deliverables?: Json | null
          duration_weeks?: number | null
          fee_cents?: number
          gate_condition?: string | null
          id?: string
          name: string
          phase_key?: string | null
          proposal_id: string
          revision_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deliverables?: Json | null
          duration_weeks?: number | null
          fee_cents?: number
          gate_condition?: string | null
          id?: string
          name?: string
          phase_key?: string | null
          proposal_id?: string
          revision_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_phases_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_scope_rooms: {
        Row: {
          budget_cents: number
          created_at: string
          dimensions: string | null
          ffe_categories: string[] | null
          floor_area_sqft: number | null
          id: string
          name: string
          notes: string | null
          proposal_id: string
          room_id: string | null
          room_type: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          budget_cents?: number
          created_at?: string
          dimensions?: string | null
          ffe_categories?: string[] | null
          floor_area_sqft?: number | null
          id?: string
          name: string
          notes?: string | null
          proposal_id: string
          room_id?: string | null
          room_type?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          budget_cents?: number
          created_at?: string
          dimensions?: string | null
          ffe_categories?: string[] | null
          floor_area_sqft?: number | null
          id?: string
          name?: string
          notes?: string | null
          proposal_id?: string
          room_id?: string | null
          room_type?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_scope_rooms_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_scope_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_scope_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_sections: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json | null
          proposal_id: string
          sort_order: number
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          proposal_id: string
          sort_order?: number
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          proposal_id?: string
          sort_order?: number
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_sections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_team_members: {
        Row: {
          created_at: string
          id: string
          permissions: Json | null
          proposal_id: string
          role: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json | null
          proposal_id: string
          role: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json | null
          proposal_id?: string
          role?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_team_members_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          estimated_pages: number | null
          id: string
          is_system: boolean
          name: string
          sections_config: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_pages?: number | null
          id?: string
          is_system?: boolean
          name: string
          sections_config?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_pages?: number | null
          id?: string
          is_system?: boolean
          name?: string
          sections_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          cc_email: string | null
          client_feedback: string | null
          client_id: string | null
          client_visibility_tier: string | null
          cover_image: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          deposit_percent: number | null
          description: string | null
          designer_id: string
          discount_amount: number | null
          discount_percent: number | null
          id: string
          parent_proposal_id: string | null
          payment_notes: string | null
          payment_terms: string | null
          personal_message: string | null
          project_address: string | null
          project_id: string | null
          revision_summary: string | null
          sent_at: string | null
          signed_at: string | null
          signed_by_name: string | null
          signed_ip: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          template_id: string | null
          title: string
          total_amount: number | null
          updated_at: string
          valid_until: string | null
          version: number | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          cc_email?: string | null
          client_feedback?: string | null
          client_id?: string | null
          client_visibility_tier?: string | null
          cover_image?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          deposit_percent?: number | null
          description?: string | null
          designer_id: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          parent_proposal_id?: string | null
          payment_notes?: string | null
          payment_terms?: string | null
          personal_message?: string | null
          project_address?: string | null
          project_id?: string | null
          revision_summary?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          signed_ip?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          template_id?: string | null
          title: string
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          cc_email?: string | null
          client_feedback?: string | null
          client_id?: string | null
          client_visibility_tier?: string | null
          cover_image?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          deposit_percent?: number | null
          description?: string | null
          designer_id?: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          parent_proposal_id?: string | null
          payment_notes?: string | null
          payment_terms?: string | null
          personal_message?: string | null
          project_address?: string | null
          project_id?: string | null
          revision_summary?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          signed_ip?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          template_id?: string | null
          title?: string
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_parent_proposal_id_fkey"
            columns: ["parent_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          confirmed_eta: string | null
          created_at: string
          delivered_date: string | null
          designer_id: string
          id: string
          is_patina_catalog: boolean
          notes: string | null
          payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          project_id: string
          status: string
          total_cents: number
          updated_at: string
          vendor_id: string
          vendor_po_number: string | null
        }
        Insert: {
          confirmed_eta?: string | null
          created_at?: string
          delivered_date?: string | null
          designer_id: string
          id?: string
          is_patina_catalog?: boolean
          notes?: string | null
          payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          project_id: string
          status?: string
          total_cents?: number
          updated_at?: string
          vendor_id: string
          vendor_po_number?: string | null
        }
        Update: {
          confirmed_eta?: string | null
          created_at?: string
          delivered_date?: string | null
          designer_id?: string
          id?: string
          is_patina_catalog?: boolean
          notes?: string | null
          payment_pattern?: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          project_id?: string
          status?: string
          total_cents?: number
          updated_at?: string
          vendor_id?: string
          vendor_po_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_auth_sessions: {
        Row: {
          approved_at: string | null
          browser: string | null
          created_at: string
          device_info: Json | null
          expires_at: string
          id: string
          ip_address: unknown
          os: string | null
          session_token: string
          status: string
          token_hash: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          browser?: string | null
          created_at?: string
          device_info?: Json | null
          expires_at: string
          id?: string
          ip_address?: unknown
          os?: string | null
          session_token: string
          status?: string
          token_hash?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          browser?: string | null
          created_at?: string
          device_info?: Json | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          os?: string | null
          session_token?: string
          status?: string
          token_hash?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      quiz_sessions: {
        Row: {
          completed_at: string | null
          computed_profile: Json | null
          conversion_event: string | null
          created_at: string | null
          id: string
          responses: Json | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          computed_profile?: Json | null
          conversion_event?: string | null
          created_at?: string | null
          id?: string
          responses?: Json | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          computed_profile?: Json | null
          conversion_event?: string | null
          created_at?: string | null
          id?: string
          responses?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      receiving_inspections: {
        Row: {
          created_at: string
          id: string
          inspected_at: string
          inspected_by: string
          notes: string | null
          outcome: Database["public"]["Enums"]["receiving_inspection_outcome"]
          photo_asset_ids: string[]
          purchase_order_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspected_at?: string
          inspected_by: string
          notes?: string | null
          outcome: Database["public"]["Enums"]["receiving_inspection_outcome"]
          photo_asset_ids?: string[]
          purchase_order_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inspected_at?: string
          inspected_by?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["receiving_inspection_outcome"]
          photo_asset_ids?: string[]
          purchase_order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receiving_inspections_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          domain: Database["public"]["Enums"]["role_domain"]
          id: string
          is_assignable: boolean
          is_system: boolean
          name: string
          parent_role_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          domain: Database["public"]["Enums"]["role_domain"]
          id?: string
          is_assignable?: boolean
          is_system?: boolean
          name: string
          parent_role_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          domain?: Database["public"]["Enums"]["role_domain"]
          id?: string
          is_assignable?: boolean
          is_system?: boolean
          name?: string
          parent_role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_parent_role_id_fkey"
            columns: ["parent_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_features: {
        Row: {
          confidence: number | null
          created_at: string
          depth: number | null
          height: number | null
          id: string
          metadata: Json | null
          position_x: number
          position_y: number
          position_z: number
          room_id: string | null
          scan_id: string | null
          type: string
          width: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          depth?: number | null
          height?: number | null
          id?: string
          metadata?: Json | null
          position_x: number
          position_y: number
          position_z: number
          room_id?: string | null
          scan_id?: string | null
          type: string
          width?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          depth?: number | null
          height?: number | null
          id?: string
          metadata?: Json | null
          position_x?: number
          position_y?: number
          position_z?: number
          room_id?: string | null
          scan_id?: string | null
          type?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_features_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_features_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_features_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_features_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      room_scan_associations: {
        Row: {
          access_level: string
          association_type: string
          consumer_id: string
          created_at: string
          designer_id: string
          expires_at: string | null
          id: string
          lead_id: string | null
          project_id: string | null
          request_message: string | null
          requested_at: string | null
          revoked_at: string | null
          revoked_reason: string | null
          scan_id: string
          shared_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          association_type?: string
          consumer_id: string
          created_at?: string
          designer_id: string
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          project_id?: string | null
          request_message?: string | null
          requested_at?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          scan_id: string
          shared_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          association_type?: string
          consumer_id?: string
          created_at?: string
          designer_id?: string
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          project_id?: string | null
          request_message?: string | null
          requested_at?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          scan_id?: string
          shared_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_scan_associations_consumer_id_fkey"
            columns: ["consumer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_consumer_id_fkey"
            columns: ["consumer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      room_scan_images: {
        Row: {
          associated_feature_id: string | null
          brightness_score: number | null
          camera_intrinsics: Json | null
          camera_transform: number[] | null
          caption: string | null
          captured_at: string
          composition_score: number | null
          created_at: string
          device_orientation: string | null
          display_order: number
          euler_angles: number[] | null
          feature_category: string | null
          feature_confidence: number | null
          file_size_bytes: number | null
          height: number | null
          id: string
          image_url: string
          is_full_resolution: boolean | null
          is_primary: boolean
          light_estimate: number | null
          light_estimate_lumens: number | null
          mime_type: string | null
          photo_kind: string | null
          quality_score: number | null
          role: string
          room_id: string | null
          scan_id: string
          sharpness_score: number | null
          stability_score: number | null
          thumbnail_url: string | null
          timestamp_seconds: number | null
          width: number | null
        }
        Insert: {
          associated_feature_id?: string | null
          brightness_score?: number | null
          camera_intrinsics?: Json | null
          camera_transform?: number[] | null
          caption?: string | null
          captured_at: string
          composition_score?: number | null
          created_at?: string
          device_orientation?: string | null
          display_order?: number
          euler_angles?: number[] | null
          feature_category?: string | null
          feature_confidence?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          image_url: string
          is_full_resolution?: boolean | null
          is_primary?: boolean
          light_estimate?: number | null
          light_estimate_lumens?: number | null
          mime_type?: string | null
          photo_kind?: string | null
          quality_score?: number | null
          role: string
          room_id?: string | null
          scan_id: string
          sharpness_score?: number | null
          stability_score?: number | null
          thumbnail_url?: string | null
          timestamp_seconds?: number | null
          width?: number | null
        }
        Update: {
          associated_feature_id?: string | null
          brightness_score?: number | null
          camera_intrinsics?: Json | null
          camera_transform?: number[] | null
          caption?: string | null
          captured_at?: string
          composition_score?: number | null
          created_at?: string
          device_orientation?: string | null
          display_order?: number
          euler_angles?: number[] | null
          feature_category?: string | null
          feature_confidence?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          image_url?: string
          is_full_resolution?: boolean | null
          is_primary?: boolean
          light_estimate?: number | null
          light_estimate_lumens?: number | null
          mime_type?: string | null
          photo_kind?: string | null
          quality_score?: number | null
          role?: string
          room_id?: string | null
          scan_id?: string
          sharpness_score?: number | null
          stability_score?: number | null
          thumbnail_url?: string | null
          timestamp_seconds?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_scan_images_associated_feature_id_fkey"
            columns: ["associated_feature_id"]
            isOneToOne: false
            referencedRelation: "room_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_images_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_images_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_images_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_images_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      room_scans: {
        Row: {
          annotations: Json | null
          artifacts_sha256: Json
          average_image_quality: number | null
          bundle_manifest_url: string | null
          capture_environment: Json | null
          captured_room_json_url: string | null
          coverage_heatmap_url: string | null
          coverage_percentage: number | null
          created_at: string
          depth_archive_url: string | null
          device_model: string | null
          dimensions: Json | null
          features: Json | null
          floor_area: number | null
          furniture_detected: Json | null
          has_lidar: boolean | null
          hero_frame_candidate_count: number | null
          hero_frame_captured_at: string | null
          hero_frame_score: number | null
          hero_frame_url: string | null
          id: string
          image_count: number | null
          measurements: Json | null
          mesh_url: string | null
          model_url: string | null
          model_url_gltf: string | null
          multi_room_builder_id: string | null
          name: string
          os_version: string | null
          photos_manifest_url: string | null
          processed_at: string | null
          project_id: string | null
          quality_grade: string | null
          room_id: string | null
          room_type: string | null
          scan_bundle_size_bytes: number | null
          scan_bundle_url: string | null
          scan_data: Json | null
          scan_schema_version: number
          scanned_at: string
          status: string
          style_signals: Json | null
          suggested_styles: string[] | null
          thumbnail_url: string | null
          upload_attempt_count: number
          upload_completed_at: string | null
          upload_error: string | null
          upload_progress: number
          upload_started_at: string | null
          user_id: string
          world_map_url: string | null
        }
        Insert: {
          annotations?: Json | null
          artifacts_sha256?: Json
          average_image_quality?: number | null
          bundle_manifest_url?: string | null
          capture_environment?: Json | null
          captured_room_json_url?: string | null
          coverage_heatmap_url?: string | null
          coverage_percentage?: number | null
          created_at?: string
          depth_archive_url?: string | null
          device_model?: string | null
          dimensions?: Json | null
          features?: Json | null
          floor_area?: number | null
          furniture_detected?: Json | null
          has_lidar?: boolean | null
          hero_frame_candidate_count?: number | null
          hero_frame_captured_at?: string | null
          hero_frame_score?: number | null
          hero_frame_url?: string | null
          id?: string
          image_count?: number | null
          measurements?: Json | null
          mesh_url?: string | null
          model_url?: string | null
          model_url_gltf?: string | null
          multi_room_builder_id?: string | null
          name: string
          os_version?: string | null
          photos_manifest_url?: string | null
          processed_at?: string | null
          project_id?: string | null
          quality_grade?: string | null
          room_id?: string | null
          room_type?: string | null
          scan_bundle_size_bytes?: number | null
          scan_bundle_url?: string | null
          scan_data?: Json | null
          scan_schema_version?: number
          scanned_at?: string
          status?: string
          style_signals?: Json | null
          suggested_styles?: string[] | null
          thumbnail_url?: string | null
          upload_attempt_count?: number
          upload_completed_at?: string | null
          upload_error?: string | null
          upload_progress?: number
          upload_started_at?: string | null
          user_id: string
          world_map_url?: string | null
        }
        Update: {
          annotations?: Json | null
          artifacts_sha256?: Json
          average_image_quality?: number | null
          bundle_manifest_url?: string | null
          capture_environment?: Json | null
          captured_room_json_url?: string | null
          coverage_heatmap_url?: string | null
          coverage_percentage?: number | null
          created_at?: string
          depth_archive_url?: string | null
          device_model?: string | null
          dimensions?: Json | null
          features?: Json | null
          floor_area?: number | null
          furniture_detected?: Json | null
          has_lidar?: boolean | null
          hero_frame_candidate_count?: number | null
          hero_frame_captured_at?: string | null
          hero_frame_score?: number | null
          hero_frame_url?: string | null
          id?: string
          image_count?: number | null
          measurements?: Json | null
          mesh_url?: string | null
          model_url?: string | null
          model_url_gltf?: string | null
          multi_room_builder_id?: string | null
          name?: string
          os_version?: string | null
          photos_manifest_url?: string | null
          processed_at?: string | null
          project_id?: string | null
          quality_grade?: string | null
          room_id?: string | null
          room_type?: string | null
          scan_bundle_size_bytes?: number | null
          scan_bundle_url?: string | null
          scan_data?: Json | null
          scan_schema_version?: number
          scanned_at?: string
          status?: string
          style_signals?: Json | null
          suggested_styles?: string[] | null
          thumbnail_url?: string | null
          upload_attempt_count?: number
          upload_completed_at?: string | null
          upload_error?: string | null
          upload_progress?: number
          upload_started_at?: string | null
          user_id?: string
          world_map_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          emergence_count: number | null
          emergence_message: string | null
          floor_area_sqm: number | null
          has_active_emergence: boolean | null
          height_meters: number | null
          id: string
          last_emergence_at: string | null
          length_meters: number | null
          name: string
          saved_item_count: number | null
          scan_count: number | null
          style_signals: Json | null
          type: string
          updated_at: string
          user_id: string
          volume_cbm: number | null
          width_meters: number | null
        }
        Insert: {
          created_at?: string
          emergence_count?: number | null
          emergence_message?: string | null
          floor_area_sqm?: number | null
          has_active_emergence?: boolean | null
          height_meters?: number | null
          id?: string
          last_emergence_at?: string | null
          length_meters?: number | null
          name: string
          saved_item_count?: number | null
          scan_count?: number | null
          style_signals?: Json | null
          type?: string
          updated_at?: string
          user_id: string
          volume_cbm?: number | null
          width_meters?: number | null
        }
        Update: {
          created_at?: string
          emergence_count?: number | null
          emergence_message?: string | null
          floor_area_sqm?: number | null
          has_active_emergence?: boolean | null
          height_meters?: number | null
          id?: string
          last_emergence_at?: string | null
          length_meters?: number | null
          name?: string
          saved_item_count?: number | null
          scan_count?: number | null
          style_signals?: Json | null
          type?: string
          updated_at?: string
          user_id?: string
          volume_cbm?: number | null
          width_meters?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          brand_name: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string
          notes: string | null
          price_in_cents: number | null
          product_id: string | null
          room_id: string | null
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_name?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          notes?: string | null
          price_in_cents?: number | null
          product_id?: string | null
          room_id?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_name?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          notes?: string | null
          price_in_cents?: number | null
          product_id?: string | null
          room_id?: string | null
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "saved_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_vendors: {
        Row: {
          designer_id: string
          id: string
          notes: string | null
          saved_at: string | null
          vendor_id: string
        }
        Insert: {
          designer_id: string
          id?: string
          notes?: string | null
          saved_at?: string | null
          vendor_id: string
        }
        Update: {
          designer_id?: string
          id?: string
          notes?: string | null
          saved_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_change_requests: {
        Row: {
          additional_design_fee_cents: number | null
          additional_ffe_budget_cents: number | null
          affected_tasks: Json | null
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          approved_ip: string | null
          co_number: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          description: string
          id: string
          new_ffe_items: Json | null
          new_rooms: Json | null
          new_total_budget_cents: number | null
          original_spec: Json | null
          project_id: string
          proposal_id: string | null
          requested_by: string
          requested_change: Json | null
          sent_at: string | null
          signature_metadata: Json | null
          signed_pdf_url: string | null
          status: string
          timeline_impact_weeks: number | null
          title: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          additional_design_fee_cents?: number | null
          additional_ffe_budget_cents?: number | null
          affected_tasks?: Json | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          approved_ip?: string | null
          co_number?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          description: string
          id?: string
          new_ffe_items?: Json | null
          new_rooms?: Json | null
          new_total_budget_cents?: number | null
          original_spec?: Json | null
          project_id: string
          proposal_id?: string | null
          requested_by: string
          requested_change?: Json | null
          sent_at?: string | null
          signature_metadata?: Json | null
          signed_pdf_url?: string | null
          status?: string
          timeline_impact_weeks?: number | null
          title: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          additional_design_fee_cents?: number | null
          additional_ffe_budget_cents?: number | null
          affected_tasks?: Json | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          approved_ip?: string | null
          co_number?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          description?: string
          id?: string
          new_ffe_items?: Json | null
          new_rooms?: Json | null
          new_total_budget_cents?: number | null
          original_spec?: Json | null
          project_id?: string
          proposal_id?: string | null
          requested_by?: string
          requested_change?: Json | null
          sent_at?: string | null
          signature_metadata?: Json | null
          signed_pdf_url?: string | null
          status?: string
          timeline_impact_weeks?: number | null
          title?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_change_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_requests_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_enrollments: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          enrolled_at: string
          id: string
          last_email_sent_at: string | null
          next_email_at: string | null
          next_step_at: string | null
          sequence_id: string
          status: string
          step_history: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_email_sent_at?: string | null
          next_email_at?: string | null
          next_step_at?: string | null
          sequence_id: string
          status?: string
          step_history?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_email_sent_at?: string | null
          next_email_at?: string | null
          next_step_at?: string | null
          sequence_id?: string
          status?: string
          step_history?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "automated_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_context: {
        Row: {
          context_text: string
          context_type: string
          generated_at: string | null
          id: string
          product_id: string
          room_id: string
        }
        Insert: {
          context_text: string
          context_type: string
          generated_at?: string | null
          id?: string
          product_id: string
          room_id: string
        }
        Update: {
          context_text?: string
          context_type?: string
          generated_at?: string | null
          id?: string
          product_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spatial_context_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spatial_context_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "spatial_context_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spatial_context_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      spectrum_calibration_products: {
        Row: {
          created_at: string | null
          id: string
          position: number
          product_id: string
          spectrum_dimension: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          position: number
          product_id: string
          spectrum_dimension: string
        }
        Update: {
          created_at?: string | null
          id?: string
          position?: number
          product_id?: string
          spectrum_dimension?: string
        }
        Relationships: [
          {
            foreignKeyName: "spectrum_calibration_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectrum_calibration_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      styles: {
        Row: {
          color_hex: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          embedding: string | null
          embedding_updated_at: string | null
          icon_name: string | null
          id: string
          is_archetype: boolean | null
          name: string
          parent_id: string | null
          updated_at: string | null
          visual_markers: string[] | null
        }
        Insert: {
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          embedding?: string | null
          embedding_updated_at?: string | null
          icon_name?: string | null
          id?: string
          is_archetype?: boolean | null
          name: string
          parent_id?: string | null
          updated_at?: string | null
          visual_markers?: string[] | null
        }
        Update: {
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          embedding?: string | null
          embedding_updated_at?: string | null
          icon_name?: string | null
          id?: string
          is_archetype?: boolean | null
          name?: string
          parent_id?: string | null
          updated_at?: string | null
          visual_markers?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "styles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_system: boolean | null
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_system?: boolean | null
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
        }
        Relationships: []
      }
      teaching_queue: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          completeness_score: number | null
          created_at: string | null
          id: string
          priority: Database["public"]["Enums"]["teaching_priority"] | null
          product_id: string
          requires_deep_analysis: boolean | null
          status: Database["public"]["Enums"]["teaching_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          completeness_score?: number | null
          created_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["teaching_priority"] | null
          product_id: string
          requires_deep_analysis?: boolean | null
          status?: Database["public"]["Enums"]["teaching_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          completeness_score?: number | null
          created_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["teaching_priority"] | null
          product_id?: string
          requires_deep_analysis?: boolean | null
          status?: Database["public"]["Enums"]["teaching_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teaching_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      teaching_sessions: {
        Row: {
          completed_at: string | null
          designer_id: string
          duration_seconds: number | null
          id: string
          mode: Database["public"]["Enums"]["teaching_mode"]
          products_taught: number | null
          started_at: string | null
        }
        Insert: {
          completed_at?: string | null
          designer_id: string
          duration_seconds?: number | null
          id?: string
          mode: Database["public"]["Enums"]["teaching_mode"]
          products_taught?: number | null
          started_at?: string | null
        }
        Update: {
          completed_at?: string | null
          designer_id?: string
          duration_seconds?: number | null
          id?: string
          mode?: Database["public"]["Enums"]["teaching_mode"]
          products_taught?: number | null
          started_at?: string | null
        }
        Relationships: []
      }
      teaching_validations: {
        Row: {
          adjustments: Json | null
          created_at: string | null
          flag_reason: string | null
          id: string
          product_id: string
          validator_id: string
          vote: Database["public"]["Enums"]["validation_vote"]
        }
        Insert: {
          adjustments?: Json | null
          created_at?: string | null
          flag_reason?: string | null
          id?: string
          product_id: string
          validator_id: string
          vote: Database["public"]["Enums"]["validation_vote"]
        }
        Update: {
          adjustments?: Json | null
          created_at?: string | null
          flag_reason?: string | null
          id?: string
          product_id?: string
          validator_id?: string
          vote?: Database["public"]["Enums"]["validation_vote"]
        }
        Relationships: [
          {
            foreignKeyName: "teaching_validations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_validations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_room_engagement: {
        Row: {
          id: string
          last_active: string | null
          primary_category: string | null
          products_added: number | null
          products_saved: number | null
          products_viewed: number | null
          room_id: string
          session_count: number | null
          total_dwell_ms: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          last_active?: string | null
          primary_category?: string | null
          products_added?: number | null
          products_saved?: number | null
          products_viewed?: number | null
          room_id: string
          session_count?: number | null
          total_dwell_ms?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          last_active?: string | null
          primary_category?: string | null
          products_added?: number | null
          products_saved?: number | null
          products_viewed?: number | null
          room_id?: string
          session_count?: number | null
          total_dwell_ms?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_room_engagement_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_room_engagement_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          auto_accept_leads: boolean | null
          compact_mode: boolean | null
          default_currency: string | null
          default_markup: number | null
          email_leads: boolean | null
          email_marketing: boolean | null
          email_messages: boolean | null
          email_notifications: boolean | null
          email_proposals: boolean | null
          lead_response_hours: number | null
          preferred_home_mode: string | null
          profile_visible: boolean | null
          push_leads: boolean | null
          push_messages: boolean | null
          push_notifications: boolean | null
          push_proposals: boolean | null
          show_in_directory: boolean | null
          show_pricing: boolean | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_accept_leads?: boolean | null
          compact_mode?: boolean | null
          default_currency?: string | null
          default_markup?: number | null
          email_leads?: boolean | null
          email_marketing?: boolean | null
          email_messages?: boolean | null
          email_notifications?: boolean | null
          email_proposals?: boolean | null
          lead_response_hours?: number | null
          preferred_home_mode?: string | null
          profile_visible?: boolean | null
          push_leads?: boolean | null
          push_messages?: boolean | null
          push_notifications?: boolean | null
          push_proposals?: boolean | null
          show_in_directory?: boolean | null
          show_pricing?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_accept_leads?: boolean | null
          compact_mode?: boolean | null
          default_currency?: string | null
          default_markup?: number | null
          email_leads?: boolean | null
          email_marketing?: boolean | null
          email_messages?: boolean | null
          email_notifications?: boolean | null
          email_proposals?: boolean | null
          lead_response_hours?: number | null
          preferred_home_mode?: string | null
          profile_visible?: boolean | null
          push_leads?: boolean | null
          push_messages?: boolean | null
          push_notifications?: boolean | null
          push_proposals?: boolean | null
          show_in_directory?: boolean | null
          show_pricing?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_style_signals: {
        Row: {
          color_temperature: string | null
          created_at: string
          formality_level: string | null
          id: string
          last_calculated_at: string | null
          natural_light_preference: number | null
          openness_preference: number | null
          signal_history: Json | null
          source_room_ids: string[] | null
          space_density: string | null
          texture_preference: number | null
          updated_at: string
          user_id: string
          warmth_preference: number | null
        }
        Insert: {
          color_temperature?: string | null
          created_at?: string
          formality_level?: string | null
          id?: string
          last_calculated_at?: string | null
          natural_light_preference?: number | null
          openness_preference?: number | null
          signal_history?: Json | null
          source_room_ids?: string[] | null
          space_density?: string | null
          texture_preference?: number | null
          updated_at?: string
          user_id: string
          warmth_preference?: number | null
        }
        Update: {
          color_temperature?: string | null
          created_at?: string
          formality_level?: string | null
          id?: string
          last_calculated_at?: string | null
          natural_light_preference?: number | null
          openness_preference?: number | null
          signal_history?: Json | null
          source_room_ids?: string[] | null
          space_density?: string | null
          texture_preference?: number | null
          updated_at?: string
          user_id?: string
          warmth_preference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_style_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_style_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_wishlist: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      vendor_brands: {
        Row: {
          brand_name: string
          brand_url: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          vendor_id: string
        }
        Insert: {
          brand_name: string
          brand_url?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          vendor_id: string
        }
        Update: {
          brand_name?: string
          brand_url?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_brands_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_certifications: {
        Row: {
          certification_level: string | null
          certification_type: string
          created_at: string | null
          expiration_date: string | null
          id: string
          is_verified: boolean | null
          updated_at: string | null
          vendor_id: string
          verification_url: string | null
        }
        Insert: {
          certification_level?: string | null
          certification_type: string
          created_at?: string | null
          expiration_date?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string | null
          vendor_id: string
          verification_url?: string | null
        }
        Update: {
          certification_level?: string | null
          certification_type?: string
          created_at?: string | null
          expiration_date?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string | null
          vendor_id?: string
          verification_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_certifications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_nominations: {
        Row: {
          catalog_live_at: string | null
          created_at: string
          decline_reason: string | null
          fit_signals: string[] | null
          id: string
          manufacturer_contact: Json
          manufacturer_responded_at: string | null
          nominated_by_user_id: string
          patina_outreach_sent_at: string | null
          patina_outreach_summary: string | null
          previous_nomination_id: string | null
          recommendation_note: string
          status: string
          status_updated_at: string
          status_updated_by: string | null
          studio_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          catalog_live_at?: string | null
          created_at?: string
          decline_reason?: string | null
          fit_signals?: string[] | null
          id?: string
          manufacturer_contact: Json
          manufacturer_responded_at?: string | null
          nominated_by_user_id: string
          patina_outreach_sent_at?: string | null
          patina_outreach_summary?: string | null
          previous_nomination_id?: string | null
          recommendation_note: string
          status?: string
          status_updated_at?: string
          status_updated_by?: string | null
          studio_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          catalog_live_at?: string | null
          created_at?: string
          decline_reason?: string | null
          fit_signals?: string[] | null
          id?: string
          manufacturer_contact?: Json
          manufacturer_responded_at?: string | null
          nominated_by_user_id?: string
          patina_outreach_sent_at?: string | null
          patina_outreach_summary?: string | null
          previous_nomination_id?: string | null
          recommendation_note?: string
          status?: string
          status_updated_at?: string
          status_updated_by?: string | null
          studio_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_nominations_nominated_by_user_id_fkey"
            columns: ["nominated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nominations_nominated_by_user_id_fkey"
            columns: ["nominated_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nominations_previous_nomination_id_fkey"
            columns: ["previous_nomination_id"]
            isOneToOne: false
            referencedRelation: "vendor_nominations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nominations_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nominations_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nominations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nominations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_nominations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reviews: {
        Row: {
          created_at: string | null
          designer_id: string
          has_ordered_recently: boolean
          id: string
          lead_time_accuracy: string | null
          lead_time_weeks_over: number | null
          overall_rating: number | null
          rating_delivery: number
          rating_finish: number
          rating_quality: number
          rating_service: number
          rating_value: number
          updated_at: string | null
          vendor_id: string
          vendor_response: string | null
          vendor_response_at: string | null
          verified_purchase: boolean | null
          written_review: string | null
        }
        Insert: {
          created_at?: string | null
          designer_id: string
          has_ordered_recently?: boolean
          id?: string
          lead_time_accuracy?: string | null
          lead_time_weeks_over?: number | null
          overall_rating?: number | null
          rating_delivery: number
          rating_finish: number
          rating_quality: number
          rating_service: number
          rating_value: number
          updated_at?: string | null
          vendor_id: string
          vendor_response?: string | null
          vendor_response_at?: string | null
          verified_purchase?: boolean | null
          written_review?: string | null
        }
        Update: {
          created_at?: string | null
          designer_id?: string
          has_ordered_recently?: boolean
          id?: string
          lead_time_accuracy?: string | null
          lead_time_weeks_over?: number | null
          overall_rating?: number | null
          rating_delivery?: number
          rating_finish?: number
          rating_quality?: number
          rating_service?: number
          rating_value?: number
          updated_at?: string | null
          vendor_id?: string
          vendor_response?: string | null
          vendor_response_at?: string | null
          verified_purchase?: boolean | null
          written_review?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reviews_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_reviews_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_specialization_votes: {
        Row: {
          created_at: string | null
          designer_id: string
          id: string
          rating: number
          specialization_id: string
        }
        Insert: {
          created_at?: string | null
          designer_id: string
          id?: string
          rating: number
          specialization_id: string
        }
        Update: {
          created_at?: string | null
          designer_id?: string
          id?: string
          rating?: number
          specialization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_specialization_votes_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "vendor_specializations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_specializations: {
        Row: {
          category: string
          created_at: string | null
          id: string
          rating: number | null
          updated_at: string | null
          vendor_id: string
          vote_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          rating?: number | null
          updated_at?: string | null
          vendor_id: string
          vote_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          rating?: number | null
          updated_at?: string | null
          vendor_id?: string
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_specializations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_trade_programs: {
        Row: {
          application_url: string | null
          benefits: string[] | null
          contact_email: string | null
          created_at: string | null
          discount_display: string | null
          discount_percent: number | null
          id: string
          minimum_requirements: string[] | null
          minimum_volume: number | null
          tier_name: string
          tier_order: number
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          application_url?: string | null
          benefits?: string[] | null
          contact_email?: string | null
          created_at?: string | null
          discount_display?: string | null
          discount_percent?: number | null
          id?: string
          minimum_requirements?: string[] | null
          minimum_volume?: number | null
          tier_name: string
          tier_order?: number
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          application_url?: string | null
          benefits?: string[] | null
          contact_email?: string | null
          created_at?: string | null
          discount_display?: string | null
          discount_percent?: number | null
          id?: string
          minimum_requirements?: string[] | null
          minimum_volume?: number | null
          tier_name?: string
          tier_order?: number
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_trade_programs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          brand_story: Json | null
          contact_info: Json | null
          created_at: string | null
          default_payment_terms:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          designer_rating_avg: number | null
          founded_year: number | null
          headquarters_city: string | null
          headquarters_state: string | null
          hero_image_url: string | null
          id: string
          is_patina_catalog: boolean
          lead_times: Json | null
          logo_url: string | null
          made_in: string | null
          market_position: Database["public"]["Enums"]["market_position"] | null
          name: string
          nominated_at: string | null
          nominated_by: string | null
          nomination_status: string | null
          notes: string | null
          ownership: Database["public"]["Enums"]["ownership_type"] | null
          parent_company_id: string | null
          preferred_contact: Json | null
          primary_category: string | null
          production_model:
            | Database["public"]["Enums"]["production_model"]
            | null
          review_count: number | null
          secondary_categories: string[] | null
          social_links: Json | null
          trade_account_established_at: string | null
          trade_terms: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          brand_story?: Json | null
          contact_info?: Json | null
          created_at?: string | null
          default_payment_terms?:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          designer_rating_avg?: number | null
          founded_year?: number | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          hero_image_url?: string | null
          id?: string
          is_patina_catalog?: boolean
          lead_times?: Json | null
          logo_url?: string | null
          made_in?: string | null
          market_position?:
            | Database["public"]["Enums"]["market_position"]
            | null
          name: string
          nominated_at?: string | null
          nominated_by?: string | null
          nomination_status?: string | null
          notes?: string | null
          ownership?: Database["public"]["Enums"]["ownership_type"] | null
          parent_company_id?: string | null
          preferred_contact?: Json | null
          primary_category?: string | null
          production_model?:
            | Database["public"]["Enums"]["production_model"]
            | null
          review_count?: number | null
          secondary_categories?: string[] | null
          social_links?: Json | null
          trade_account_established_at?: string | null
          trade_terms?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          brand_story?: Json | null
          contact_info?: Json | null
          created_at?: string | null
          default_payment_terms?:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          designer_rating_avg?: number | null
          founded_year?: number | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          hero_image_url?: string | null
          id?: string
          is_patina_catalog?: boolean
          lead_times?: Json | null
          logo_url?: string | null
          made_in?: string | null
          market_position?:
            | Database["public"]["Enums"]["market_position"]
            | null
          name?: string
          nominated_at?: string | null
          nominated_by?: string | null
          nomination_status?: string | null
          notes?: string | null
          ownership?: Database["public"]["Enums"]["ownership_type"] | null
          parent_company_id?: string | null
          preferred_contact?: Json | null
          primary_category?: string | null
          production_model?:
            | Database["public"]["Enums"]["production_model"]
            | null
          review_count?: number | null
          secondary_categories?: string[] | null
          social_links?: Json | null
          trade_account_established_at?: string | null
          trade_terms?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_nominated_by_fkey"
            columns: ["nominated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_nominated_by_fkey"
            columns: ["nominated_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          assigned_admin_id: string | null
          auth_user_id: string | null
          company_name: string | null
          converted_at: string | null
          created_at: string
          cta_text: string | null
          disqualified_reason: string | null
          email: string
          first_touch_attribution: Json | null
          full_name: string | null
          id: string
          ip_address: unknown
          last_contacted_at: string | null
          last_touch_attribution: Json | null
          next_follow_up_at: string | null
          notes: string | null
          phone: string | null
          posthog_distinct_id: string | null
          qualification_stage: string
          referrer: string | null
          role: string | null
          signup_page: string | null
          source: string
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          auth_user_id?: string | null
          company_name?: string | null
          converted_at?: string | null
          created_at?: string
          cta_text?: string | null
          disqualified_reason?: string | null
          email: string
          first_touch_attribution?: Json | null
          full_name?: string | null
          id?: string
          ip_address?: unknown
          last_contacted_at?: string | null
          last_touch_attribution?: Json | null
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          posthog_distinct_id?: string | null
          qualification_stage?: string
          referrer?: string | null
          role?: string | null
          signup_page?: string | null
          source: string
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          auth_user_id?: string | null
          company_name?: string | null
          converted_at?: string | null
          created_at?: string
          cta_text?: string | null
          disqualified_reason?: string | null
          email?: string
          first_touch_attribution?: Json | null
          full_name?: string | null
          id?: string
          ip_address?: unknown
          last_contacted_at?: string | null
          last_touch_attribution?: Json | null
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          posthog_distinct_id?: string | null
          qualification_stage?: string
          referrer?: string | null
          role?: string | null
          signup_page?: string | null
          source?: string
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      waitlist_activities: {
        Row: {
          actor_admin_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          waitlist_id: string
        }
        Insert: {
          actor_admin_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json | null
          waitlist_id: string
        }
        Update: {
          actor_admin_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          waitlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_activities_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: false
            referencedRelation: "waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_tasks: {
        Row: {
          assigned_admin_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          title: string
          updated_at: string
          waitlist_id: string
        }
        Insert: {
          assigned_admin_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          title: string
          updated_at?: string
          waitlist_id: string
        }
        Update: {
          assigned_admin_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          title?: string
          updated_at?: string
          waitlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_tasks_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: false
            referencedRelation: "waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      consumer_funnel: {
        Row: {
          count: number | null
          step: string | null
          step_order: number | null
        }
        Relationships: []
      }
      conversion_funnel: {
        Row: {
          conversion_rate_percent: number | null
          step: string | null
          step_order: number | null
          users_at_previous_step: number | null
          users_at_step: number | null
        }
        Relationships: []
      }
      delivery_events: {
        Row: {
          delivered_date: string | null
          event_date: string | null
          event_id: string | null
          event_type: string | null
          ffe_item_count: number | null
          inspection_id: string | null
          inspection_outcome:
            | Database["public"]["Enums"]["receiving_inspection_outcome"]
            | null
          line_total_cents: number | null
          phase_key: string | null
          po_status: string | null
          project_id: string | null
          project_name: string | null
          purchase_order_id: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: []
      }
      designer_funnel: {
        Row: {
          count: number | null
          step: string | null
          step_order: number | null
        }
        Relationships: []
      }
      room_scans_v2: {
        Row: {
          average_image_quality: number | null
          capture_environment: Json | null
          captured_room_json_url: string | null
          coverage_percentage: number | null
          created_at: string | null
          depth_archive_url: string | null
          device_model: string | null
          dimensions: Json | null
          features: Json | null
          floor_area: number | null
          furniture_detected: Json | null
          has_lidar: boolean | null
          hero_frame_score: number | null
          hero_frame_url: string | null
          id: string | null
          image_count: number | null
          mesh_url: string | null
          model_url: string | null
          multi_room_builder_id: string | null
          name: string | null
          os_version: string | null
          project_id: string | null
          quality_grade: string | null
          room_id: string | null
          room_type: string | null
          scan_bundle_size_bytes: number | null
          scan_bundle_url: string | null
          scan_data: Json | null
          scan_schema_version: number | null
          scanned_at: string | null
          status: string | null
          style_signals: Json | null
          suggested_styles: string[] | null
          thumbnail_url: string | null
          user_id: string | null
          world_map_url: string | null
        }
        Insert: {
          average_image_quality?: number | null
          capture_environment?: Json | null
          captured_room_json_url?: string | null
          coverage_percentage?: number | null
          created_at?: string | null
          depth_archive_url?: string | null
          device_model?: string | null
          dimensions?: Json | null
          features?: Json | null
          floor_area?: number | null
          furniture_detected?: Json | null
          has_lidar?: boolean | null
          hero_frame_score?: number | null
          hero_frame_url?: string | null
          id?: string | null
          image_count?: number | null
          mesh_url?: string | null
          model_url?: string | null
          multi_room_builder_id?: string | null
          name?: string | null
          os_version?: string | null
          project_id?: string | null
          quality_grade?: string | null
          room_id?: string | null
          room_type?: string | null
          scan_bundle_size_bytes?: number | null
          scan_bundle_url?: string | null
          scan_data?: Json | null
          scan_schema_version?: number | null
          scanned_at?: string | null
          status?: string | null
          style_signals?: Json | null
          suggested_styles?: string[] | null
          thumbnail_url?: string | null
          user_id?: string | null
          world_map_url?: string | null
        }
        Update: {
          average_image_quality?: number | null
          capture_environment?: Json | null
          captured_room_json_url?: string | null
          coverage_percentage?: number | null
          created_at?: string | null
          depth_archive_url?: string | null
          device_model?: string | null
          dimensions?: Json | null
          features?: Json | null
          floor_area?: number | null
          furniture_detected?: Json | null
          has_lidar?: boolean | null
          hero_frame_score?: number | null
          hero_frame_url?: string | null
          id?: string | null
          image_count?: number | null
          mesh_url?: string | null
          model_url?: string | null
          multi_room_builder_id?: string | null
          name?: string | null
          os_version?: string | null
          project_id?: string | null
          quality_grade?: string | null
          room_id?: string | null
          room_type?: string | null
          scan_bundle_size_bytes?: number | null
          scan_bundle_url?: string | null
          scan_data?: Json | null
          scan_schema_version?: number | null
          scanned_at?: string | null
          status?: string | null
          style_signals?: Json | null
          suggested_styles?: string[] | null
          thumbnail_url?: string | null
          user_id?: string | null
          world_map_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_with_hero_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms_with_hero_frames: {
        Row: {
          created_at: string | null
          emergence_message: string | null
          floor_area_sqm: number | null
          has_active_emergence: boolean | null
          hero_frame_captured_at: string | null
          hero_frame_score: number | null
          hero_frame_url: string | null
          id: string | null
          name: string | null
          saved_item_count: number | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_engagement_scores: {
        Row: {
          current_score: number | null
          email: string | null
          engagement_tier: string | null
          id: string | null
          last_active_at: string | null
          role: string | null
        }
        Insert: {
          current_score?: never
          email?: string | null
          engagement_tier?: never
          id?: string | null
          last_active_at?: string | null
          role?: string | null
        }
        Update: {
          current_score?: never
          email?: string | null
          engagement_tier?: never
          id?: string | null
          last_active_at?: string | null
          role?: string | null
        }
        Relationships: []
      }
      v_promotion_candidates: {
        Row: {
          has_order_history: boolean | null
          name: string | null
          owner_user_id: string | null
          product_id: string | null
          project_count: number | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_studios: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          slug: string | null
          status: Database["public"]["Enums"]["organization_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["organization_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["organization_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_project_v2: { Args: { input: Json }; Returns: string }
      activate_proposal_as_project: {
        Args: { p_proposal_id: string; p_start_date?: string }
        Returns: string
      }
      aggregate_user_style_signals: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      apply_decision: {
        Args: {
          p_decision_id: string
          p_selected_by?: string
          p_selected_option_id: string
        }
        Returns: undefined
      }
      apply_phase_template: {
        Args: { p_proposal_id: string; p_template_slug: string }
        Returns: string[]
      }
      apply_scope_change: { Args: { p_request_id: string }; Returns: undefined }
      calculate_engagement_score: {
        Args: { p_user_id: string }
        Returns: number
      }
      comms_resolve_role: { Args: { p_user_id: string }; Returns: string }
      consume_capture: {
        Args: {
          p_capture_id: string
          p_ffe_category_slug: string
          p_proposal_id: string
          p_qty?: number
          p_scope_room_id: string
        }
        Returns: string
      }
      decrement_room_saved_items: {
        Args: { p_count?: number; p_room_id: string }
        Returns: undefined
      }
      evaluate_collection_rules: {
        Args: { p_collection_id: string }
        Returns: Json
      }
      expire_room_scan_associations: { Args: never; Returns: number }
      find_products_for_style: {
        Args: { match_count?: number; style_id: string }
        Returns: {
          id: string
          images: string[]
          name: string
          price_retail: number
          similarity: number
        }[]
      }
      find_products_similar_to: {
        Args: { match_count?: number; product_id: string }
        Returns: {
          id: string
          images: string[]
          name: string
          price_retail: number
          similarity: number
        }[]
      }
      find_similar_products: {
        Args: {
          exclude_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          images: string[]
          name: string
          price_retail: number
          similarity: number
        }[]
      }
      get_ab_variant_stats: {
        Args: { p_campaign_id: string }
        Returns: {
          bounced: number
          clicked: number
          delivered: number
          opened: number
          sent: number
          variant: string
        }[]
      }
      get_conversation_history: {
        Args: { p_cursor?: string; p_limit?: number; p_user_id: string }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          role: Database["public"]["Enums"]["companion_message_role"]
        }[]
      }
      get_decision_analytics_by_client: {
        Args: { p_designer_id: string }
        Returns: {
          avg_response_hours: number
          client_name: string
          designer_client_id: string
          on_time_rate: number
          responded_count: number
          total_count: number
        }[]
      }
      get_decision_analytics_by_type: {
        Args: { p_designer_id: string }
        Returns: {
          avg_response_hours: number
          decision_type: string
          on_time_count: number
          responded_count: number
          total_count: number
        }[]
      }
      get_decision_bottleneck_phases: {
        Args: { p_designer_id: string }
        Returns: {
          avg_response_hours: number
          linked_phase: string
          overdue_count: number
          total_count: number
        }[]
      }
      get_decision_bottleneck_phases_admin: {
        Args: never
        Returns: {
          avg_response_hours: number
          linked_phase: string
          overdue_count: number
          pending_count: number
          responded_count: number
          total_count: number
        }[]
      }
      get_embedding_stats: {
        Args: never
        Returns: {
          embedding_coverage_percent: number
          products_with_embedding: number
          products_without_embedding: number
          styles_with_embedding: number
          total_products: number
          total_styles: number
        }[]
      }
      get_or_create_conversation: {
        Args: { p_context?: Json; p_screen?: string; p_user_id: string }
        Returns: string
      }
      get_outbox_counts: {
        Args: never
        Returns: {
          oldest_unpublished: string
          published: number
          source: string
          unpublished: number
        }[]
      }
      get_outbox_events: {
        Args: { p_limit?: number; p_unpublished_only?: boolean }
        Returns: {
          created_at: string
          event_type: string
          id: string
          last_error: string
          published: boolean
          published_at: string
          retry_count: number
          source: string
        }[]
      }
      get_recommendations: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_room_id?: string
        }
        Returns: {
          badges: string[]
          category: string
          id: string
          image_url: string
          maker_location: string
          maker_name: string
          maker_story: string
          match_score: number
          material_tags: string[]
          name: string
          price_cents: number
          style_tags: string[]
          tier: string
          usdz_url: string
        }[]
      }
      get_room_scan_hero_image: {
        Args: { p_scan_id: string }
        Returns: {
          id: string
          image_url: string
          quality_score: number
        }[]
      }
      get_room_scan_images: {
        Args: { p_scan_id: string }
        Returns: {
          display_order: number
          feature_category: string
          id: string
          image_url: string
          is_primary: boolean
          quality_score: number
          role: string
        }[]
      }
      get_user_permissions: { Args: { p_user_id: string }; Returns: string[] }
      grant_role_to_user: {
        Args: { p_granted_by?: string; p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      immutable_array_to_string: {
        Args: { arr: string[]; sep: string }
        Returns: string
      }
      increment_bounce_count: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      increment_campaign_counter: {
        Args: { p_campaign_id: string; p_column: string }
        Returns: undefined
      }
      increment_room_saved_items: {
        Args: { p_count?: number; p_room_id: string }
        Returns: undefined
      }
      increment_sequence_counter: {
        Args: { p_column: string; p_sequence_id: string }
        Returns: undefined
      }
      invoke_edge_function: {
        Args: { body?: Json; fn_name: string }
        Returns: number
      }
      is_comms_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_comms_thread_participant: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      is_org_admin_or_owner: {
        Args: { _organization_id: string; _user_id?: string }
        Returns: boolean
      }
      is_project_team_member: {
        Args: { _project_id: string; _user_id?: string }
        Returns: boolean
      }
      list_designer_open_proposals: {
        Args: { p_designer_id?: string }
        Returns: {
          id: string
          project_name: string
          scope_rooms_count: number
          title: string
        }[]
      }
      mark_scan_upload_complete: {
        Args: { p_scan_id: string }
        Returns: undefined
      }
      merge_scan_artifact_sha256: {
        Args: { p_kind: string; p_scan_id: string; p_sha: string }
        Returns: undefined
      }
      migrate_legacy_ffe_notes: { Args: never; Returns: number }
      next_co_number: { Args: { p_project_id: string }; Returns: string }
      process_style_quiz: {
        Args: { quiz_answers: Json; timings?: Json }
        Returns: Json
      }
      revoke_role_from_user: {
        Args: { p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      revoke_room_scan_access: {
        Args: { p_association_id: string; p_reason?: string }
        Returns: boolean
      }
      rpc_mark_thread_read: { Args: { p_thread_id: string }; Returns: boolean }
      rpc_soft_delete_message: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      rpc_start_direct_thread: {
        Args: { counterpart: string }
        Returns: string
      }
      rpc_start_project_thread: {
        Args: { p_project_id: string }
        Returns: string
      }
      rpc_start_vendor_brief: {
        Args: { p_body: string; p_project_id: string; p_vendor_id: string }
        Returns: string
      }
      rpc_unread_summary: {
        Args: never
        Returns: {
          kind: string
          last_message_at: string
          project_id: string
          thread_id: string
          unread_count: number
        }[]
      }
      search_products: {
        Args: {
          category_filter?: string
          max_price?: number
          min_price?: number
          page_offset?: number
          page_size?: number
          search_query?: string
          sort_by?: string
          style_filter?: string
        }
        Returns: {
          description: string
          id: string
          images: string[]
          materials: string[]
          name: string
          price_retail: number
          relevance_score: number
          style_names: string[]
          vendor_name: string
        }[]
      }
      search_products_semantic: {
        Args: {
          match_count?: number
          query_embedding: string
          search_query: string
        }
        Returns: {
          combined_score: number
          description: string
          id: string
          images: string[]
          name: string
          price_retail: number
          semantic_score: number
          text_score: number
        }[]
      }
      set_room_emergence: {
        Args: {
          p_has_emergence: boolean
          p_message?: string
          p_room_id: string
        }
        Returns: undefined
      }
      share_room_scan: {
        Args: {
          p_access_level?: string
          p_designer_id: string
          p_expires_in_days?: number
          p_lead_id?: string
          p_project_id?: string
          p_scan_id: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_has_role: {
        Args: { p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      user_is_org_member: {
        Args: {
          p_min_role?: Database["public"]["Enums"]["member_role"]
          p_org_id: string
          p_user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_deletion_status:
        | "pending"
        | "processing"
        | "completed"
        | "cancelled"
      account_status: "none" | "pending" | "active"
      api_key_environment: "live" | "test"
      api_key_status: "active" | "revoked"
      appeal_category: "visual" | "functional" | "emotional" | "lifestyle"
      application_review_status:
        | "new"
        | "in_review"
        | "approved"
        | "rejected"
        | "archived"
      audience_type: "all" | "segment" | "individual"
      audit_status: "success" | "failure" | "denied"
      campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "sent"
        | "cancelled"
        | "archived"
      companion_message_role: "user" | "companion"
      damage_claim_state: "drafted" | "vendor_notified" | "resolved"
      data_export_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "expired"
      designer_application_status:
        | "pending"
        | "under_review"
        | "approved"
        | "rejected"
      digest_frequency: "daily" | "weekly" | "biweekly" | "monthly" | "never"
      email_template_category:
        | "transactional"
        | "engagement"
        | "campaign"
        | "sequence"
      market_position: "entry" | "mid" | "premium" | "luxury" | "ultra-luxury"
      member_role: "owner" | "admin" | "member" | "guest"
      member_status: "active" | "invited" | "suspended" | "removed"
      notification_channel: "email" | "push" | "in_app" | "sms"
      notification_status:
        | "queued"
        | "sending"
        | "delivered"
        | "opened"
        | "clicked"
        | "bounced"
        | "failed"
        | "suppressed"
      oauth_provider: "apple" | "google"
      organization_status:
        | "active"
        | "suspended"
        | "pending_approval"
        | "deactivated"
      organization_type:
        | "design_studio"
        | "manufacturer"
        | "contractor"
        | "admin_team"
      ownership_type: "family" | "private" | "pe-backed" | "public"
      po_payment_kind: "deposit" | "balance" | "milestone"
      po_payment_state: "pending" | "due" | "paid"
      procurement_notification_kind:
        | "deposit_due"
        | "balance_due"
        | "milestone_due"
        | "delivery_this_week"
        | "damage_claim_drafted"
      production_model: "stock" | "mto" | "custom" | "mixed"
      project_status: "active" | "completed" | "archived" | "on_hold" | "draft"
      purchase_order_payment_pattern:
        | "fifty_fifty"
        | "thirty_seventy"
        | "full_upfront"
        | "net_30"
        | "custom_milestones"
      receiving_inspection_outcome: "clean" | "damaged" | "partial"
      relation_type: "pairs_with" | "alternative" | "never_with"
      role_domain: "consumer" | "designer" | "manufacturer" | "admin"
      sequence_status: "draft" | "active" | "paused" | "archived"
      subscription_tier: "free" | "professional" | "enterprise"
      teaching_mode: "embedded" | "quick_tags" | "deep_analysis" | "validation"
      teaching_priority: "high" | "normal" | "low"
      teaching_status:
        | "pending"
        | "in_progress"
        | "needs_validation"
        | "validated"
        | "conflict"
      validation_vote: "confirm" | "adjust" | "flag"
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
    Enums: {
      account_deletion_status: [
        "pending",
        "processing",
        "completed",
        "cancelled",
      ],
      account_status: ["none", "pending", "active"],
      api_key_environment: ["live", "test"],
      api_key_status: ["active", "revoked"],
      appeal_category: ["visual", "functional", "emotional", "lifestyle"],
      application_review_status: [
        "new",
        "in_review",
        "approved",
        "rejected",
        "archived",
      ],
      audience_type: ["all", "segment", "individual"],
      audit_status: ["success", "failure", "denied"],
      campaign_status: [
        "draft",
        "scheduled",
        "sending",
        "sent",
        "cancelled",
        "archived",
      ],
      companion_message_role: ["user", "companion"],
      damage_claim_state: ["drafted", "vendor_notified", "resolved"],
      data_export_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "expired",
      ],
      designer_application_status: [
        "pending",
        "under_review",
        "approved",
        "rejected",
      ],
      digest_frequency: ["daily", "weekly", "biweekly", "monthly", "never"],
      email_template_category: [
        "transactional",
        "engagement",
        "campaign",
        "sequence",
      ],
      market_position: ["entry", "mid", "premium", "luxury", "ultra-luxury"],
      member_role: ["owner", "admin", "member", "guest"],
      member_status: ["active", "invited", "suspended", "removed"],
      notification_channel: ["email", "push", "in_app", "sms"],
      notification_status: [
        "queued",
        "sending",
        "delivered",
        "opened",
        "clicked",
        "bounced",
        "failed",
        "suppressed",
      ],
      oauth_provider: ["apple", "google"],
      organization_status: [
        "active",
        "suspended",
        "pending_approval",
        "deactivated",
      ],
      organization_type: [
        "design_studio",
        "manufacturer",
        "contractor",
        "admin_team",
      ],
      ownership_type: ["family", "private", "pe-backed", "public"],
      po_payment_kind: ["deposit", "balance", "milestone"],
      po_payment_state: ["pending", "due", "paid"],
      procurement_notification_kind: [
        "deposit_due",
        "balance_due",
        "milestone_due",
        "delivery_this_week",
        "damage_claim_drafted",
      ],
      production_model: ["stock", "mto", "custom", "mixed"],
      project_status: ["active", "completed", "archived", "on_hold", "draft"],
      purchase_order_payment_pattern: [
        "fifty_fifty",
        "thirty_seventy",
        "full_upfront",
        "net_30",
        "custom_milestones",
      ],
      receiving_inspection_outcome: ["clean", "damaged", "partial"],
      relation_type: ["pairs_with", "alternative", "never_with"],
      role_domain: ["consumer", "designer", "manufacturer", "admin"],
      sequence_status: ["draft", "active", "paused", "archived"],
      subscription_tier: ["free", "professional", "enterprise"],
      teaching_mode: ["embedded", "quick_tags", "deep_analysis", "validation"],
      teaching_priority: ["high", "normal", "low"],
      teaching_status: [
        "pending",
        "in_progress",
        "needs_validation",
        "validated",
        "conflict",
      ],
      validation_vote: ["confirm", "adjust", "flag"],
    },
  },
} as const

