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
      aesthete_audit: {
        Row: {
          check_name: string
          created_at: string | null
          detail: Json | null
          id: number
          passed: boolean
          week: string
        }
        Insert: {
          check_name: string
          created_at?: string | null
          detail?: Json | null
          id?: never
          passed: boolean
          week: string
        }
        Update: {
          check_name?: string
          created_at?: string | null
          detail?: Json | null
          id?: never
          passed?: boolean
          week?: string
        }
        Relationships: []
      }
      aesthete_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string | null
          dedupe_key: string | null
          id: number
          kind: string
          last_error: string | null
          payload: Json | null
          product_id: string | null
          run_after: string | null
          status: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: never
          kind: string
          last_error?: string | null
          payload?: Json | null
          product_id?: string | null
          run_after?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: never
          kind?: string
          last_error?: string | null
          payload?: Json | null
          product_id?: string | null
          run_after?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "aesthete_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aesthete_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "aesthete_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "aesthete_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "aesthete_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      aesthete_spend_ledger: {
        Row: {
          cache_read_tokens: number | null
          day: string
          input_tokens: number | null
          output_tokens: number | null
          products: number | null
          usd: number | null
        }
        Insert: {
          cache_read_tokens?: number | null
          day: string
          input_tokens?: number | null
          output_tokens?: number | null
          products?: number | null
          usd?: number | null
        }
        Update: {
          cache_read_tokens?: number | null
          day?: string
          input_tokens?: number | null
          output_tokens?: number | null
          products?: number | null
          usd?: number | null
        }
        Relationships: []
      }
      agent_task_audit: {
        Row: {
          actor: string
          at: string
          id: number
          new_row: Json | null
          old_row: Json | null
          op: string
          task_id: string
          txid: number
        }
        Insert: {
          actor: string
          at?: string
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          op: string
          task_id: string
          txid?: number
        }
        Update: {
          actor?: string
          at?: string
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          op?: string
          task_id?: string
          txid?: number
        }
        Relationships: []
      }
      agent_tasks: {
        Row: {
          artifacts: Json
          assignee: string | null
          attempts: number
          awaiting_review_at: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          flagged_stale_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_task_id: string | null
          payload: Json
          priority: number
          review_state: Json | null
          run_after: string
          source: string
          started_at: string | null
          status: string
          summary: string
          task_type: string
          updated_at: string
        }
        Insert: {
          artifacts?: Json
          assignee?: string | null
          attempts?: number
          awaiting_review_at?: string | null
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          flagged_stale_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          parent_task_id?: string | null
          payload?: Json
          priority?: number
          review_state?: Json | null
          run_after?: string
          source?: string
          started_at?: string | null
          status?: string
          summary?: string
          task_type: string
          updated_at?: string
        }
        Update: {
          artifacts?: Json
          assignee?: string | null
          attempts?: number
          awaiting_review_at?: string | null
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          flagged_stale_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          parent_task_id?: string | null
          payload?: Json
          priority?: number
          review_state?: Json | null
          run_after?: string
          source?: string
          started_at?: string | null
          status?: string
          summary?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
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
      ask_embed_cache: {
        Row: {
          cache_key: string
          created_at: string
          embedding: string
          expires_at: string
          model_version: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          embedding: string
          expires_at?: string
          model_version: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          embedding?: string
          expires_at?: string
          model_version?: string
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
      bias_templates: {
        Row: {
          description: string | null
          name: string
          pattern: string
        }
        Insert: {
          description?: string | null
          name: string
          pattern: string
        }
        Update: {
          description?: string | null
          name?: string
          pattern?: string
        }
        Relationships: []
      }
      bridge_state: {
        Row: {
          bridge: string
          delta_link: string | null
          items_processed: number
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          updated_at: string
        }
        Insert: {
          bridge: string
          delta_link?: string | null
          items_processed?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Update: {
          bridge?: string
          delta_link?: string | null
          items_processed?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Relationships: []
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
      catalog_feed_batches: {
        Row: {
          auto_count: number | null
          commit_task_id: string | null
          content_hash: string
          created_at: string
          error: string | null
          id: string
          pipeline_vendor_id: string | null
          review_count: number | null
          row_count: number | null
          source: string
          status: string
          storage_path: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          auto_count?: number | null
          commit_task_id?: string | null
          content_hash: string
          created_at?: string
          error?: string | null
          id?: string
          pipeline_vendor_id?: string | null
          review_count?: number | null
          row_count?: number | null
          source: string
          status?: string
          storage_path: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          auto_count?: number | null
          commit_task_id?: string | null
          content_hash?: string
          created_at?: string
          error?: string | null
          id?: string
          pipeline_vendor_id?: string | null
          review_count?: number | null
          row_count?: number | null
          source?: string
          status?: string
          storage_path?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_feed_batches_commit_task_id_fkey"
            columns: ["commit_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_feed_batches_pipeline_vendor_id_fkey"
            columns: ["pipeline_vendor_id"]
            isOneToOne: false
            referencedRelation: "pipeline_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_feed_batches_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_feed_items: {
        Row: {
          action: string | null
          batch_id: string
          committed_product_id: string | null
          confidence: number | null
          created_at: string
          diff: Json | null
          error: string | null
          field_confidence: Json | null
          id: string
          match_product_id: string | null
          normalized: Json | null
          raw: Json
          row_index: number
          source_row_hash: string
          status: string
        }
        Insert: {
          action?: string | null
          batch_id: string
          committed_product_id?: string | null
          confidence?: number | null
          created_at?: string
          diff?: Json | null
          error?: string | null
          field_confidence?: Json | null
          id?: string
          match_product_id?: string | null
          normalized?: Json | null
          raw: Json
          row_index: number
          source_row_hash: string
          status?: string
        }
        Update: {
          action?: string | null
          batch_id?: string
          committed_product_id?: string | null
          confidence?: number | null
          created_at?: string
          diff?: Json | null
          error?: string | null
          field_confidence?: Json | null
          id?: string
          match_product_id?: string | null
          normalized?: Json | null
          raw?: Json
          row_index?: number
          source_row_hash?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_feed_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "catalog_feed_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_feed_items_committed_product_id_fkey"
            columns: ["committed_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_feed_items_committed_product_id_fkey"
            columns: ["committed_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_feed_items_committed_product_id_fkey"
            columns: ["committed_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_feed_items_committed_product_id_fkey"
            columns: ["committed_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_feed_items_committed_product_id_fkey"
            columns: ["committed_product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_feed_items_match_product_id_fkey"
            columns: ["match_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_feed_items_match_product_id_fkey"
            columns: ["match_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_feed_items_match_product_id_fkey"
            columns: ["match_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_feed_items_match_product_id_fkey"
            columns: ["match_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "catalog_feed_items_match_product_id_fkey"
            columns: ["match_product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
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
          approves: boolean
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
          product_id: string | null
          quantity: number | null
          selected: boolean | null
          sort_order: number | null
        }
        Insert: {
          approves?: boolean
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
          product_id?: string | null
          quantity?: number | null
          selected?: boolean | null
          sort_order?: number | null
        }
        Update: {
          approves?: boolean
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
          product_id?: string | null
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
          {
            foreignKeyName: "client_decision_options_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
          {
            foreignKeyName: "client_decision_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_decision_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "client_decision_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "client_decision_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "client_decision_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      client_decisions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          blocking_status: string
          blocks_kind: string
          blocks_milestone_id: string | null
          client_consent_method: string | null
          client_consented_at: string | null
          client_signature: string | null
          context: string | null
          coordination_kind: string
          court: string
          court_party_id: string | null
          created_at: string
          decision_kind: string
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
          room_id: string | null
          section_key: string | null
          selected_by: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          blocking_status?: string
          blocks_kind?: string
          blocks_milestone_id?: string | null
          client_consent_method?: string | null
          client_consented_at?: string | null
          client_signature?: string | null
          context?: string | null
          coordination_kind?: string
          court?: string
          court_party_id?: string | null
          created_at?: string
          decision_kind?: string
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
          room_id?: string | null
          section_key?: string | null
          selected_by?: string | null
          sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          blocking_status?: string
          blocks_kind?: string
          blocks_milestone_id?: string | null
          client_consent_method?: string | null
          client_consented_at?: string | null
          client_signature?: string | null
          context?: string | null
          coordination_kind?: string
          court?: string
          court_party_id?: string | null
          created_at?: string
          decision_kind?: string
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
          room_id?: string | null
          section_key?: string | null
          selected_by?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_decisions_blocks_milestone_id_fkey"
            columns: ["blocks_milestone_id"]
            isOneToOne: false
            referencedRelation: "schedule_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_decisions_court_party_id_fkey"
            columns: ["court_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
          {
            foreignKeyName: "client_decisions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      client_discovery: {
        Row: {
          avoid_items: Json
          budget_basis: string | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          created_at: string
          decision_makers: Json
          designer_client_id: string
          designer_id: string
          hard_date: string | null
          id: string
          keep_items: Json
          lifestyle: Json
          project_type: string | null
          ready_at: string | null
          room_scan_id: string | null
          rooms: Json
          seeded_at: string | null
          seeded_proposal_id: string | null
          site_notes: string | null
          start_urgency: string | null
          style_keywords: string[]
          style_tag_ids: string[]
          target_date: string | null
          updated_at: string
        }
        Insert: {
          avoid_items?: Json
          budget_basis?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          decision_makers?: Json
          designer_client_id: string
          designer_id: string
          hard_date?: string | null
          id?: string
          keep_items?: Json
          lifestyle?: Json
          project_type?: string | null
          ready_at?: string | null
          room_scan_id?: string | null
          rooms?: Json
          seeded_at?: string | null
          seeded_proposal_id?: string | null
          site_notes?: string | null
          start_urgency?: string | null
          style_keywords?: string[]
          style_tag_ids?: string[]
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          avoid_items?: Json
          budget_basis?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          decision_makers?: Json
          designer_client_id?: string
          designer_id?: string
          hard_date?: string | null
          id?: string
          keep_items?: Json
          lifestyle?: Json
          project_type?: string | null
          ready_at?: string | null
          room_scan_id?: string | null
          rooms?: Json
          seeded_at?: string | null
          seeded_proposal_id?: string | null
          site_notes?: string | null
          start_urgency?: string | null
          style_keywords?: string[]
          style_tag_ids?: string[]
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_discovery_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: true
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discovery_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discovery_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discovery_room_scan_id_fkey"
            columns: ["room_scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discovery_room_scan_id_fkey"
            columns: ["room_scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discovery_seeded_proposal_id_fkey"
            columns: ["seeded_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
          content: string | null
          created_at: string
          designer_client_id: string
          email_sent_at: string | null
          id: string
          product_id: string | null
          reason: string | null
          status: string
          suggested_date: string | null
          touchpoint_type: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          designer_client_id: string
          email_sent_at?: string | null
          id?: string
          product_id?: string | null
          reason?: string | null
          status?: string
          suggested_date?: string | null
          touchpoint_type: string
        }
        Update: {
          content?: string | null
          created_at?: string
          designer_client_id?: string
          email_sent_at?: string | null
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "client_nurture_touchpoints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "client_nurture_touchpoints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
      client_style_profiles: {
        Row: {
          archetype_primary: string | null
          archetype_weights: Json
          boldness: number | null
          budget: Json
          complexity: number | null
          confidence: number | null
          craftsmanship: number | null
          created_at: string | null
          formality: number | null
          functional_priorities: Json | null
          id: string
          is_current: boolean
          material_affinities: Json | null
          patina_affinity: number | null
          quiz_session_id: string | null
          session_key: string
          source: string
          spectrum_confidence: Json
          style_vector: string | null
          timelessness: number | null
          updated_at: string | null
          user_id: string | null
          version: number
          warmth: number | null
        }
        Insert: {
          archetype_primary?: string | null
          archetype_weights?: Json
          boldness?: number | null
          budget?: Json
          complexity?: number | null
          confidence?: number | null
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          functional_priorities?: Json | null
          id?: string
          is_current?: boolean
          material_affinities?: Json | null
          patina_affinity?: number | null
          quiz_session_id?: string | null
          session_key: string
          source?: string
          spectrum_confidence?: Json
          style_vector?: string | null
          timelessness?: number | null
          updated_at?: string | null
          user_id?: string | null
          version?: number
          warmth?: number | null
        }
        Update: {
          archetype_primary?: string | null
          archetype_weights?: Json
          boldness?: number | null
          budget?: Json
          complexity?: number | null
          confidence?: number | null
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          functional_priorities?: Json | null
          id?: string
          is_current?: boolean
          material_affinities?: Json | null
          patina_affinity?: number | null
          quiz_session_id?: string | null
          session_key?: string
          source?: string
          spectrum_confidence?: Json
          style_vector?: string | null
          timelessness?: number | null
          updated_at?: string | null
          user_id?: string | null
          version?: number
          warmth?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_style_profiles_archetype_primary_fkey"
            columns: ["archetype_primary"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_style_profiles_quiz_session_id_fkey"
            columns: ["quiz_session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            foreignKeyName: "comms_messages_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
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
          anchor_id: string | null
          anchor_kind: string | null
          coordination_item_id: string | null
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
          anchor_id?: string | null
          anchor_kind?: string | null
          coordination_item_id?: string | null
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
          anchor_id?: string | null
          anchor_kind?: string | null
          coordination_item_id?: string | null
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
            foreignKeyName: "comms_threads_coordination_item_id_fkey"
            columns: ["coordination_item_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comms_threads_coordination_item_id_fkey"
            columns: ["coordination_item_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
      concierge_orders: {
        Row: {
          checklists: Json
          client_invoice_id: string | null
          created_at: string
          damage: Json | null
          direct_order_id: string | null
          freight: Json | null
          id: string
          linked_task_ids: string[]
          payment_flag: string
          payment_flag_detail: Json | null
          project_id: string | null
          purchase_order_id: string | null
          stage: string
          stage_entered_at: string
          title: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          checklists?: Json
          client_invoice_id?: string | null
          created_at?: string
          damage?: Json | null
          direct_order_id?: string | null
          freight?: Json | null
          id?: string
          linked_task_ids?: string[]
          payment_flag?: string
          payment_flag_detail?: Json | null
          project_id?: string | null
          purchase_order_id?: string | null
          stage?: string
          stage_entered_at?: string
          title: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          checklists?: Json
          client_invoice_id?: string | null
          created_at?: string
          damage?: Json | null
          direct_order_id?: string | null
          freight?: Json | null
          id?: string
          linked_task_ids?: string[]
          payment_flag?: string
          payment_flag_detail?: Json | null
          project_id?: string | null
          purchase_order_id?: string | null
          stage?: string
          stage_entered_at?: string
          title?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concierge_orders_client_invoice_id_fkey"
            columns: ["client_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_orders_direct_order_id_fkey"
            columns: ["direct_order_id"]
            isOneToOne: false
            referencedRelation: "direct_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "concierge_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_orders_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: true
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
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
      coordination_item_revisions: {
        Row: {
          attachments: Json
          created_at: string
          decision_id: string
          id: string
          note: string | null
          rev_number: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
        }
        Insert: {
          attachments?: Json
          created_at?: string
          decision_id: string
          id?: string
          note?: string | null
          rev_number: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
        }
        Update: {
          attachments?: Json
          created_at?: string
          decision_id?: string
          id?: string
          note?: string | null
          rev_number?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coordination_item_revisions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coordination_item_revisions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
        ]
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
      daily_briefs: {
        Row: {
          brief_date: string
          content: Json
          email_sent_at: string | null
          generated_at: string
        }
        Insert: {
          brief_date: string
          content?: Json
          email_sent_at?: string | null
          generated_at?: string
        }
        Update: {
          brief_date?: string
          content?: Json
          email_sent_at?: string | null
          generated_at?: string
        }
        Relationships: []
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
          ffe_item_id: string | null
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
          ffe_item_id?: string | null
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
          ffe_item_id?: string | null
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
            foreignKeyName: "damage_claims_ffe_item_id_fkey"
            columns: ["ffe_item_id"]
            isOneToOne: false
            referencedRelation: "project_ffe_items"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "decision_comments_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
        ]
      }
      decision_events: {
        Row: {
          changed_by: string | null
          created_at: string
          decision_id: string
          id: string
          new_status: string | null
          old_status: string | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          decision_id: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          decision_id?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_events_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_events_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
        ]
      }
      decision_notifications: {
        Row: {
          created_at: string
          decision_id: string
          id: string
          kind: Database["public"]["Enums"]["decision_notification_kind"]
          read_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision_id: string
          id?: string
          kind: Database["public"]["Enums"]["decision_notification_kind"]
          read_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["decision_notification_kind"]
          read_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_notifications_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_notifications_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
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
            foreignKeyName: "decision_overrides_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
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
          {
            foreignKeyName: "designer_clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "open_design_requests"
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
          invoice_id: string | null
          invoice_payment_id: string | null
          net_amount: number
          order_id: string | null
          paid_at: string | null
          payout_id: string | null
          platform_fee: number | null
          project_id: string | null
          proposal_id: string | null
          proposal_item_id: string | null
          reverses_invoice_payment_id: string | null
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
          invoice_id?: string | null
          invoice_payment_id?: string | null
          net_amount: number
          order_id?: string | null
          paid_at?: string | null
          payout_id?: string | null
          platform_fee?: number | null
          project_id?: string | null
          proposal_id?: string | null
          proposal_item_id?: string | null
          reverses_invoice_payment_id?: string | null
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
          invoice_id?: string | null
          invoice_payment_id?: string | null
          net_amount?: number
          order_id?: string | null
          paid_at?: string | null
          payout_id?: string | null
          platform_fee?: number | null
          project_id?: string | null
          proposal_id?: string | null
          proposal_item_id?: string | null
          reverses_invoice_payment_id?: string | null
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
            foreignKeyName: "designer_earnings_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_earnings_invoice_payment_id_fkey"
            columns: ["invoice_payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_earnings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "designer_earnings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          {
            foreignKeyName: "designer_earnings_reverses_invoice_payment_id_fkey"
            columns: ["reverses_invoice_payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_interruption_rules: {
        Row: {
          created_at: string
          designer_id: string
          enabled: boolean
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          designer_id: string
          enabled?: boolean
          id?: string
          kind: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          designer_id?: string
          enabled?: boolean
          id?: string
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "designer_interruption_rules_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_interruption_rules_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
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
      designer_portfolio_items: {
        Row: {
          caption: string | null
          created_at: string | null
          designer_id: string
          embedding: string | null
          id: string
          status: string
          storage_path: string
          updated_at: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          designer_id: string
          embedding?: string | null
          id?: string
          status?: string
          storage_path: string
          updated_at?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          designer_id?: string
          embedding?: string | null
          id?: string
          status?: string
          storage_path?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      designer_prospects: {
        Row: {
          application_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          instagram: string | null
          market_city: string | null
          market_state: string | null
          next_action: string | null
          next_action_due: string | null
          notes: string | null
          owner: string
          portfolio_url: string | null
          profile_id: string | null
          source: string | null
          stage: string
          stage_entered_at: string
          studio_name: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          instagram?: string | null
          market_city?: string | null
          market_state?: string | null
          next_action?: string | null
          next_action_due?: string | null
          notes?: string | null
          owner?: string
          portfolio_url?: string | null
          profile_id?: string | null
          source?: string | null
          stage?: string
          stage_entered_at?: string
          studio_name?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          instagram?: string | null
          market_city?: string | null
          market_state?: string | null
          next_action?: string | null
          next_action_due?: string | null
          notes?: string | null
          owner?: string
          portfolio_url?: string | null
          profile_id?: string | null
          source?: string | null
          stage?: string
          stage_entered_at?: string
          studio_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "designer_prospects_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "founding_designer_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_prospects_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_prospects_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_style_confidence: {
        Row: {
          designer_id: string
          judgment_count: number | null
          level: string
          style_id: string
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          designer_id: string
          judgment_count?: number | null
          level: string
          style_id: string
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          designer_id?: string
          judgment_count?: number | null
          level?: string
          style_id?: string
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_style_confidence_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "styles"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_taste_profiles: {
        Row: {
          boldness: number | null
          complexity: number | null
          confidence_map: Json
          craftsmanship: number | null
          designer_id: string
          deviation_from_house: Json | null
          drift_flag: boolean | null
          formality: number | null
          judgments_processed_at: string | null
          portfolio_centroid: string | null
          reliability: number
          retired_at: string | null
          sources: Json
          taste_vector: string | null
          theta: number[] | null
          timelessness: number | null
          updated_at: string | null
          version: number
          warmth: number | null
        }
        Insert: {
          boldness?: number | null
          complexity?: number | null
          confidence_map?: Json
          craftsmanship?: number | null
          designer_id: string
          deviation_from_house?: Json | null
          drift_flag?: boolean | null
          formality?: number | null
          judgments_processed_at?: string | null
          portfolio_centroid?: string | null
          reliability?: number
          retired_at?: string | null
          sources?: Json
          taste_vector?: string | null
          theta?: number[] | null
          timelessness?: number | null
          updated_at?: string | null
          version?: number
          warmth?: number | null
        }
        Update: {
          boldness?: number | null
          complexity?: number | null
          confidence_map?: Json
          craftsmanship?: number | null
          designer_id?: string
          deviation_from_house?: Json | null
          drift_flag?: boolean | null
          formality?: number | null
          judgments_processed_at?: string | null
          portfolio_centroid?: string | null
          reliability?: number
          retired_at?: string | null
          sources?: Json
          taste_vector?: string | null
          theta?: number[] | null
          timelessness?: number | null
          updated_at?: string | null
          version?: number
          warmth?: number | null
        }
        Relationships: []
      }
      designer_taste_snapshots: {
        Row: {
          created_at: string | null
          designer_id: string
          id: number
          reliability: number | null
          sources: Json | null
          spectrums: Json | null
          taste_vector: string | null
          theta: number[] | null
          version: number
        }
        Insert: {
          created_at?: string | null
          designer_id: string
          id?: never
          reliability?: number | null
          sources?: Json | null
          spectrums?: Json | null
          taste_vector?: string | null
          theta?: number[] | null
          version: number
        }
        Update: {
          created_at?: string | null
          designer_id?: string
          id?: never
          reliability?: number | null
          sources?: Json | null
          spectrums?: Json | null
          taste_vector?: string | null
          theta?: number[] | null
          version?: number
        }
        Relationships: []
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
      device_push_tokens: {
        Row: {
          created_at: string
          environment: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          environment: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_orders: {
        Row: {
          amount_cents: number
          client_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          product_id: string
          product_name: string
          quantity: number
          shipping: Json | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          unit_price_cents: number
        }
        Insert: {
          amount_cents: number
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          product_id: string
          product_name: string
          quantity: number
          shipping?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          unit_price_cents: number
        }
        Update: {
          amount_cents?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          shipping?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "direct_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "direct_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "direct_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "direct_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      dna_vocab: {
        Row: {
          attribute: string
          family: string
          label: string | null
          sort: number | null
          value: string
        }
        Insert: {
          attribute: string
          family: string
          label?: string | null
          sort?: number | null
          value: string
        }
        Update: {
          attribute?: string
          family?: string
          label?: string | null
          sort?: number | null
          value?: string
        }
        Relationships: []
      }
      document_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          last_viewed_at: string | null
          proposal_id: string
          status: string
          token_hash: string
          updated_at: string
          view_count: number
          visibility: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          proposal_id: string
          status?: string
          token_hash: string
          updated_at?: string
          view_count?: number
          visibility: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          proposal_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
          view_count?: number
          visibility?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "editorial_stories_featured_product_id_fkey"
            columns: ["featured_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "editorial_stories_featured_product_id_fkey"
            columns: ["featured_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      feedback: {
        Row: {
          app_version: string | null
          bucket: string
          created_at: string
          created_by: string
          element: string | null
          id: string
          note: string | null
          resolution: string | null
          route: string | null
          screen_name: string | null
          screenshot_path: string | null
          shipped_seen_at: string | null
          status: string
          updated_at: string
          viewport: string | null
          weight: string | null
        }
        Insert: {
          app_version?: string | null
          bucket: string
          created_at?: string
          created_by?: string
          element?: string | null
          id?: string
          note?: string | null
          resolution?: string | null
          route?: string | null
          screen_name?: string | null
          screenshot_path?: string | null
          shipped_seen_at?: string | null
          status?: string
          updated_at?: string
          viewport?: string | null
          weight?: string | null
        }
        Update: {
          app_version?: string | null
          bucket?: string
          created_at?: string
          created_by?: string
          element?: string | null
          id?: string
          note?: string | null
          resolution?: string | null
          route?: string | null
          screen_name?: string | null
          screenshot_path?: string | null
          shipped_seen_at?: string | null
          status?: string
          updated_at?: string
          viewport?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_events: {
        Row: {
          actor: string
          created_at: string
          feedback_id: string
          id: string
          kind: string
          payload: Json
        }
        Insert: {
          actor?: string
          created_at?: string
          feedback_id: string
          id?: string
          kind: string
          payload?: Json
        }
        Update: {
          actor?: string
          created_at?: string
          feedback_id?: string
          id?: string
          kind?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "feedback_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_events_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
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
      field_captures: {
        Row: {
          app_version: string | null
          artifacts_sha256: Json
          barcode_symbology: string | null
          barcode_value: string | null
          capture_schema_version: number
          captured_accuracy_m: number | null
          captured_at: string
          captured_lat: number | null
          captured_lng: number | null
          captured_timezone: string | null
          catalog_match_product_id: string | null
          category: string | null
          client_capture_id: string
          colors: string[] | null
          committed_at: string | null
          created_at: string
          designer_id: string
          destination: string
          device_model: string | null
          dimensions: Json | null
          finish: string | null
          guesses: Json
          id: string
          material_tags: string[] | null
          materials: string[] | null
          media_manifest_url: string | null
          notes: string | null
          organization_id: string | null
          os_version: string | null
          photos: Json
          price_retail_cents: number | null
          price_trade_cents: number | null
          primary_photo_path: string | null
          product_id: string | null
          project_id: string | null
          project_room_id: string | null
          provenance: Json
          raw_payload: Json
          shelf: string | null
          sku: string | null
          status: string
          style_tags: string[] | null
          subcategory: string | null
          synced_at: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          upload_completed_at: string | null
          upload_error: string | null
          upload_progress: number
          vendor_id: string | null
          vendor_name: string | null
          venue_label: string | null
          venue_place_id: string | null
          voice_audio_path: string | null
          voice_duration_seconds: number | null
          voice_partial_transcript: string | null
          voice_transcript: string | null
        }
        Insert: {
          app_version?: string | null
          artifacts_sha256?: Json
          barcode_symbology?: string | null
          barcode_value?: string | null
          capture_schema_version?: number
          captured_accuracy_m?: number | null
          captured_at?: string
          captured_lat?: number | null
          captured_lng?: number | null
          captured_timezone?: string | null
          catalog_match_product_id?: string | null
          category?: string | null
          client_capture_id: string
          colors?: string[] | null
          committed_at?: string | null
          created_at?: string
          designer_id: string
          destination?: string
          device_model?: string | null
          dimensions?: Json | null
          finish?: string | null
          guesses?: Json
          id?: string
          material_tags?: string[] | null
          materials?: string[] | null
          media_manifest_url?: string | null
          notes?: string | null
          organization_id?: string | null
          os_version?: string | null
          photos?: Json
          price_retail_cents?: number | null
          price_trade_cents?: number | null
          primary_photo_path?: string | null
          product_id?: string | null
          project_id?: string | null
          project_room_id?: string | null
          provenance?: Json
          raw_payload?: Json
          shelf?: string | null
          sku?: string | null
          status?: string
          style_tags?: string[] | null
          subcategory?: string | null
          synced_at?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_completed_at?: string | null
          upload_error?: string | null
          upload_progress?: number
          vendor_id?: string | null
          vendor_name?: string | null
          venue_label?: string | null
          venue_place_id?: string | null
          voice_audio_path?: string | null
          voice_duration_seconds?: number | null
          voice_partial_transcript?: string | null
          voice_transcript?: string | null
        }
        Update: {
          app_version?: string | null
          artifacts_sha256?: Json
          barcode_symbology?: string | null
          barcode_value?: string | null
          capture_schema_version?: number
          captured_accuracy_m?: number | null
          captured_at?: string
          captured_lat?: number | null
          captured_lng?: number | null
          captured_timezone?: string | null
          catalog_match_product_id?: string | null
          category?: string | null
          client_capture_id?: string
          colors?: string[] | null
          committed_at?: string | null
          created_at?: string
          designer_id?: string
          destination?: string
          device_model?: string | null
          dimensions?: Json | null
          finish?: string | null
          guesses?: Json
          id?: string
          material_tags?: string[] | null
          materials?: string[] | null
          media_manifest_url?: string | null
          notes?: string | null
          organization_id?: string | null
          os_version?: string | null
          photos?: Json
          price_retail_cents?: number | null
          price_trade_cents?: number | null
          primary_photo_path?: string | null
          product_id?: string | null
          project_id?: string | null
          project_room_id?: string | null
          provenance?: Json
          raw_payload?: Json
          shelf?: string | null
          sku?: string | null
          status?: string
          style_tags?: string[] | null
          subcategory?: string | null
          synced_at?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_completed_at?: string | null
          upload_error?: string | null
          upload_progress?: number
          vendor_id?: string | null
          vendor_name?: string | null
          venue_label?: string | null
          venue_place_id?: string | null
          voice_audio_path?: string | null
          voice_duration_seconds?: number | null
          voice_partial_transcript?: string | null
          voice_transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_captures_catalog_match_product_id_fkey"
            columns: ["catalog_match_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_catalog_match_product_id_fkey"
            columns: ["catalog_match_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_catalog_match_product_id_fkey"
            columns: ["catalog_match_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_catalog_match_product_id_fkey"
            columns: ["catalog_match_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_catalog_match_product_id_fkey"
            columns: ["catalog_match_product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "field_captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "field_captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_project_room_id_fkey"
            columns: ["project_room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_captures_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      field_link_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          party_id: string
          project_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          party_id: string
          project_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          party_id?: string
          project_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_link_tokens_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_link_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "field_link_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          lead_attribution: Json | null
          location: string | null
          motivation: string | null
          posthog_distinct_id: string | null
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
          lead_attribution?: Json | null
          location?: string | null
          motivation?: string | null
          posthog_distinct_id?: string | null
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
          lead_attribution?: Json | null
          location?: string | null
          motivation?: string | null
          posthog_distinct_id?: string | null
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
      house_taste: {
        Row: {
          boldness: number | null
          complexity: number | null
          computed_from: Json
          craftsmanship: number | null
          created_at: string | null
          curated_by: string | null
          curated_overrides: Json | null
          formality: number | null
          id: string
          notes: string | null
          status: string
          taste_vector: string
          theta: number[] | null
          timelessness: number | null
          version: number
          warmth: number | null
        }
        Insert: {
          boldness?: number | null
          complexity?: number | null
          computed_from?: Json
          craftsmanship?: number | null
          created_at?: string | null
          curated_by?: string | null
          curated_overrides?: Json | null
          formality?: number | null
          id?: string
          notes?: string | null
          status?: string
          taste_vector: string
          theta?: number[] | null
          timelessness?: number | null
          version: number
          warmth?: number | null
        }
        Update: {
          boldness?: number | null
          complexity?: number | null
          computed_from?: Json
          craftsmanship?: number | null
          created_at?: string | null
          curated_by?: string | null
          curated_overrides?: Json | null
          formality?: number | null
          id?: string
          notes?: string | null
          status?: string
          taste_vector?: string
          theta?: number[] | null
          timelessness?: number | null
          version?: number
          warmth?: number | null
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
      invoice_counters: {
        Row: {
          designer_id: string
          next_number: number
        }
        Insert: {
          designer_id: string
          next_number?: number
        }
        Update: {
          designer_id?: string
          next_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_counters_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_counters_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          ffe_item_id: string | null
          id: string
          invoice_id: string
          kind: string
          metadata: Json
          milestone_id: string | null
          quantity: number
          sort_order: number
          unit_amount_cents: number
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          ffe_item_id?: string | null
          id?: string
          invoice_id: string
          kind?: string
          metadata?: Json
          milestone_id?: string | null
          quantity?: number
          sort_order?: number
          unit_amount_cents?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          ffe_item_id?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          metadata?: Json
          milestone_id?: string | null
          quantity?: number
          sort_order?: number
          unit_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_ffe_item_id_fkey"
            columns: ["ffe_item_id"]
            isOneToOne: false
            referencedRelation: "project_ffe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_payment_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          invoice_id: string
          method: string
          note: string | null
          received_at: string | null
          recorded_by: string | null
          reference: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          invoice_id: string
          method: string
          note?: string | null
          received_at?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string
          note?: string | null
          received_at?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid_cents: number
          ar_flagged_at: string | null
          ar_last_chased_at: string | null
          client_id: string | null
          created_at: string
          currency: string
          designer_id: string
          due_date: string | null
          id: string
          internal_notes: string | null
          invoice_number: string | null
          issue_date: string | null
          last_reminder_at: string | null
          memo: string | null
          paid_at: string | null
          payment_terms_days: number
          project_id: string
          reminder_count: number
          sent_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          studio_id: string | null
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount_paid_cents?: number
          ar_flagged_at?: string | null
          ar_last_chased_at?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          designer_id: string
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          last_reminder_at?: string | null
          memo?: string | null
          paid_at?: string | null
          payment_terms_days?: number
          project_id: string
          reminder_count?: number
          sent_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          studio_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_paid_cents?: number
          ar_flagged_at?: string | null
          ar_last_chased_at?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          designer_id?: string
          due_date?: string | null
          id?: string
          internal_notes?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          last_reminder_at?: string | null
          memo?: string | null
          paid_at?: string | null
          payment_terms_days?: number
          project_id?: string
          reminder_count?: number
          sent_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          studio_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
        ]
      }
      item_feedback: {
        Row: {
          board_item_id: string | null
          body: string | null
          client_id: string
          created_at: string
          decision_id: string | null
          ffe_item_id: string | null
          id: string
          proposal_item_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
          verdict: string
        }
        Insert: {
          board_item_id?: string | null
          body?: string | null
          client_id?: string
          created_at?: string
          decision_id?: string | null
          ffe_item_id?: string | null
          id?: string
          proposal_item_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
          verdict: string
        }
        Update: {
          board_item_id?: string | null
          body?: string | null
          client_id?: string
          created_at?: string
          decision_id?: string | null
          ffe_item_id?: string | null
          id?: string
          proposal_item_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_feedback_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_board_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_feedback_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_feedback_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
          {
            foreignKeyName: "item_feedback_ffe_item_id_fkey"
            columns: ["ffe_item_id"]
            isOneToOne: false
            referencedRelation: "project_ffe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_feedback_proposal_item_id_fkey"
            columns: ["proposal_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_feedback_events: {
        Row: {
          actor: string
          body: string | null
          created_at: string
          feedback_id: string
          id: string
          kind: string
        }
        Insert: {
          actor?: string
          body?: string | null
          created_at?: string
          feedback_id: string
          id?: string
          kind: string
        }
        Update: {
          actor?: string
          body?: string | null
          created_at?: string
          feedback_id?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_feedback_events_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "item_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          cost_usd: number | null
          detail: Json
          error: string | null
          finished_at: string | null
          id: number
          job_name: string
          started_at: string
          status: string
        }
        Insert: {
          cost_usd?: number | null
          detail?: Json
          error?: string | null
          finished_at?: string | null
          id?: never
          job_name: string
          started_at?: string
          status?: string
        }
        Update: {
          cost_usd?: number | null
          detail?: Json
          error?: string | null
          finished_at?: string | null
          id?: never
          job_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      lead_room_scans: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          lead_id: string
          position: number
          scan_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_id: string
          position?: number
          scan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_id?: string
          position?: number
          scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_room_scans_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_room_scans_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "open_design_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_room_scans_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_room_scans_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "room_scans_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          accepted_at: string | null
          budget_range: string | null
          client_request_id: string | null
          contact_email: string | null
          contact_name: string | null
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
          source: string | null
          status: string
          timeline: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          budget_range?: string | null
          client_request_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
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
          source?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          budget_range?: string | null
          client_request_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
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
          source?: string | null
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
          lead_attribution: Json | null
          location: string | null
          materials: string | null
          posthog_distinct_id: string | null
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
          lead_attribution?: Json | null
          location?: string | null
          materials?: string | null
          posthog_distinct_id?: string | null
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
          lead_attribution?: Json | null
          location?: string | null
          materials?: string | null
          posthog_distinct_id?: string | null
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
      margin_notes: {
        Row: {
          anchor_id: string | null
          anchor_kind: string
          body: string
          created_at: string
          designer_client_id: string | null
          designer_id: string
          due_date: string | null
          escalated_to_decision_id: string | null
          escalated_to_scope_change_id: string | null
          id: string
          project_id: string | null
          proposal_id: string | null
          updated_at: string
        }
        Insert: {
          anchor_id?: string | null
          anchor_kind?: string
          body: string
          created_at?: string
          designer_client_id?: string | null
          designer_id: string
          due_date?: string | null
          escalated_to_decision_id?: string | null
          escalated_to_scope_change_id?: string | null
          id?: string
          project_id?: string | null
          proposal_id?: string | null
          updated_at?: string
        }
        Update: {
          anchor_id?: string | null
          anchor_kind?: string
          body?: string
          created_at?: string
          designer_client_id?: string | null
          designer_id?: string
          due_date?: string | null
          escalated_to_decision_id?: string | null
          escalated_to_scope_change_id?: string | null
          id?: string
          project_id?: string | null
          proposal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "margin_notes_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "margin_notes_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "margin_notes_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "margin_notes_escalated_to_decision_id_fkey"
            columns: ["escalated_to_decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "margin_notes_escalated_to_decision_id_fkey"
            columns: ["escalated_to_decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
          {
            foreignKeyName: "margin_notes_escalated_to_scope_change_id_fkey"
            columns: ["escalated_to_scope_change_id"]
            isOneToOne: false
            referencedRelation: "scope_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "margin_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "margin_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "margin_notes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      match_ceremonies: {
        Row: {
          client_id: string | null
          created_at: string
          credential_line: string | null
          designer_client_id: string | null
          designer_id: string
          draft_slots: Json
          id: string
          intro_message_id: string | null
          intro_text: string | null
          lead_id: string
          offered_at: string | null
          offered_slots: Json | null
          picked_at: string | null
          picked_slot_id: string | null
          picked_slot_starts_at: string | null
          portfolio_url: string | null
          state: string
          thread_id: string | null
          timezone: string | null
          updated_at: string
          voice_attachment: Json | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          credential_line?: string | null
          designer_client_id?: string | null
          designer_id: string
          draft_slots?: Json
          id?: string
          intro_message_id?: string | null
          intro_text?: string | null
          lead_id: string
          offered_at?: string | null
          offered_slots?: Json | null
          picked_at?: string | null
          picked_slot_id?: string | null
          picked_slot_starts_at?: string | null
          portfolio_url?: string | null
          state?: string
          thread_id?: string | null
          timezone?: string | null
          updated_at?: string
          voice_attachment?: Json | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          credential_line?: string | null
          designer_client_id?: string | null
          designer_id?: string
          draft_slots?: Json
          id?: string
          intro_message_id?: string | null
          intro_text?: string | null
          lead_id?: string
          offered_at?: string | null
          offered_slots?: Json | null
          picked_at?: string | null
          picked_slot_id?: string | null
          picked_slot_starts_at?: string | null
          portfolio_url?: string | null
          state?: string
          thread_id?: string | null
          timezone?: string | null
          updated_at?: string
          voice_attachment?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "match_ceremonies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_intro_message_id_fkey"
            columns: ["intro_message_id"]
            isOneToOne: false
            referencedRelation: "comms_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "open_design_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_ceremonies_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "comms_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          context: Json | null
          created_at: string | null
          designer_id: string | null
          house_version: number | null
          id: number
          latency_ms: number | null
          results: Json
          session_key: string | null
          source: string
          user_id: string | null
          w: number | null
          w_effective: number | null
          weights_version: number | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          designer_id?: string | null
          house_version?: number | null
          id?: never
          latency_ms?: number | null
          results: Json
          session_key?: string | null
          source: string
          user_id?: string | null
          w?: number | null
          w_effective?: number | null
          weights_version?: number | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          designer_id?: string | null
          house_version?: number | null
          id?: never
          latency_ms?: number | null
          results?: Json
          session_key?: string | null
          source?: string
          user_id?: string | null
          w?: number | null
          w_effective?: number | null
          weights_version?: number | null
        }
        Relationships: []
      }
      match_weight_profiles: {
        Row: {
          created_at: string | null
          is_active: boolean
          name: string
          notes: string | null
          version: number
          weights: Json
        }
        Insert: {
          created_at?: string | null
          is_active?: boolean
          name: string
          notes?: string | null
          version: number
          weights: Json
        }
        Update: {
          created_at?: string | null
          is_active?: boolean
          name?: string
          notes?: string | null
          version?: number
          weights?: Json
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
      metric_thresholds: {
        Row: {
          active: boolean
          display_order: number
          green_max: number | null
          green_min: number | null
          label: string
          metric_key: string
          unit: string
          updated_at: string
          yellow_max: number | null
          yellow_min: number | null
        }
        Insert: {
          active?: boolean
          display_order?: number
          green_max?: number | null
          green_min?: number | null
          label: string
          metric_key: string
          unit: string
          updated_at?: string
          yellow_max?: number | null
          yellow_min?: number | null
        }
        Update: {
          active?: boolean
          display_order?: number
          green_max?: number | null
          green_min?: number | null
          label?: string
          metric_key?: string
          unit?: string
          updated_at?: string
          yellow_max?: number | null
          yellow_min?: number | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          confirmation_token: string | null
          confirmed: boolean
          created_at: string
          email: string
          id: string
          lead_attribution: Json | null
          posthog_distinct_id: string | null
          referrer: string | null
          signup_page: string | null
          source: string
          subscribed: boolean
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          confirmation_token?: string | null
          confirmed?: boolean
          created_at?: string
          email: string
          id?: string
          lead_attribution?: Json | null
          posthog_distinct_id?: string | null
          referrer?: string | null
          signup_page?: string | null
          source?: string
          subscribed?: boolean
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          confirmation_token?: string | null
          confirmed?: boolean
          created_at?: string
          email?: string
          id?: string
          lead_attribution?: Json | null
          posthog_distinct_id?: string | null
          referrer?: string | null
          signup_page?: string | null
          source?: string
          subscribed?: boolean
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
          last_reminder_digest_sent_at: string | null
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reminder_cadence: string
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
          type_onboarding: boolean
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
          last_reminder_digest_sent_at?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reminder_cadence?: string
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
          type_onboarding?: boolean
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
          last_reminder_digest_sent_at?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reminder_cadence?: string
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
          type_onboarding?: boolean
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
      pipeline_stage_events: {
        Row: {
          actor: string
          created_at: string
          entity_id: string
          entity_type: string
          from_stage: string | null
          id: string
          note: string | null
          to_stage: string
        }
        Insert: {
          actor: string
          created_at?: string
          entity_id: string
          entity_type: string
          from_stage?: string | null
          id?: string
          note?: string | null
          to_stage: string
        }
        Update: {
          actor?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_stage?: string | null
          id?: string
          note?: string | null
          to_stage?: string
        }
        Relationships: []
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
      po_counters: {
        Row: {
          designer_id: string
          next_number: number
        }
        Insert: {
          designer_id: string
          next_number?: number
        }
        Update: {
          designer_id?: string
          next_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_counters_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_counters_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
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
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
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
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
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
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_appeal_signals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_appeal_signals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_client_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_client_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      product_dna: {
        Row: {
          accent_colors: string[] | null
          ambiance: string | null
          arm_profile: string | null
          attr_source: Json
          back_profile: string | null
          character_trajectory: string | null
          collection: string | null
          color_histogram: Json | null
          color_saturation: number | null
          color_temperature: number | null
          color_value: number | null
          comfort: number | null
          confidence: Json
          context: Json | null
          craftsmanship_tier: number | null
          created_at: string | null
          dna_version: number
          dominant_color: string | null
          durability_for: string[] | null
          edition: string | null
          era: string | null
          flexibility: number | null
          joinery: string | null
          lead_time_days: number | null
          leg_style: string | null
          line_quality: number | null
          maintenance_reality: Json | null
          material_honesty: number | null
          mood_keywords: string[] | null
          negative_space: number | null
          origin_country: string | null
          originating_designer: string | null
          palette_family: string | null
          patina_potential: number | null
          pattern_density: number | null
          price_tier: string | null
          primary_function: string | null
          product_id: string
          proportion_notes: string | null
          provenance_story: string | null
          sheen: number | null
          silhouette: string | null
          solidity: number | null
          surface_texture: string | null
          sustainability: string[] | null
          symmetry: string | null
          updated_at: string | null
          value_story: string | null
          visual_scale: number | null
        }
        Insert: {
          accent_colors?: string[] | null
          ambiance?: string | null
          arm_profile?: string | null
          attr_source?: Json
          back_profile?: string | null
          character_trajectory?: string | null
          collection?: string | null
          color_histogram?: Json | null
          color_saturation?: number | null
          color_temperature?: number | null
          color_value?: number | null
          comfort?: number | null
          confidence?: Json
          context?: Json | null
          craftsmanship_tier?: number | null
          created_at?: string | null
          dna_version?: number
          dominant_color?: string | null
          durability_for?: string[] | null
          edition?: string | null
          era?: string | null
          flexibility?: number | null
          joinery?: string | null
          lead_time_days?: number | null
          leg_style?: string | null
          line_quality?: number | null
          maintenance_reality?: Json | null
          material_honesty?: number | null
          mood_keywords?: string[] | null
          negative_space?: number | null
          origin_country?: string | null
          originating_designer?: string | null
          palette_family?: string | null
          patina_potential?: number | null
          pattern_density?: number | null
          price_tier?: string | null
          primary_function?: string | null
          product_id: string
          proportion_notes?: string | null
          provenance_story?: string | null
          sheen?: number | null
          silhouette?: string | null
          solidity?: number | null
          surface_texture?: string | null
          sustainability?: string[] | null
          symmetry?: string | null
          updated_at?: string | null
          value_story?: string | null
          visual_scale?: number | null
        }
        Update: {
          accent_colors?: string[] | null
          ambiance?: string | null
          arm_profile?: string | null
          attr_source?: Json
          back_profile?: string | null
          character_trajectory?: string | null
          collection?: string | null
          color_histogram?: Json | null
          color_saturation?: number | null
          color_temperature?: number | null
          color_value?: number | null
          comfort?: number | null
          confidence?: Json
          context?: Json | null
          craftsmanship_tier?: number | null
          created_at?: string | null
          dna_version?: number
          dominant_color?: string | null
          durability_for?: string[] | null
          edition?: string | null
          era?: string | null
          flexibility?: number | null
          joinery?: string | null
          lead_time_days?: number | null
          leg_style?: string | null
          line_quality?: number | null
          maintenance_reality?: Json | null
          material_honesty?: number | null
          mood_keywords?: string[] | null
          negative_space?: number | null
          origin_country?: string | null
          originating_designer?: string | null
          palette_family?: string | null
          patina_potential?: number | null
          pattern_density?: number | null
          price_tier?: string | null
          primary_function?: string | null
          product_id?: string
          proportion_notes?: string | null
          provenance_story?: string | null
          sheen?: number | null
          silhouette?: string | null
          solidity?: number | null
          surface_texture?: string | null
          sustainability?: string[] | null
          symmetry?: string | null
          updated_at?: string | null
          value_story?: string | null
          visual_scale?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_dna_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_dna_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_dna_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_dna_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_dna_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_dna_drafts: {
        Row: {
          created_at: string | null
          draft: Json
          id: number
          model: string
          overall_confidence: number | null
          product_id: string
          prompt_version: string
        }
        Insert: {
          created_at?: string | null
          draft: Json
          id?: never
          model: string
          overall_confidence?: number | null
          product_id: string
          prompt_version: string
        }
        Update: {
          created_at?: string | null
          draft?: Json
          id?: never
          model?: string
          overall_confidence?: number | null
          product_id?: string
          prompt_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_dna_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_dna_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_dna_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_dna_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_dna_drafts_product_id_fkey"
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_engagement_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_engagement_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_a_id_fkey"
            columns: ["product_a_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_a_id_fkey"
            columns: ["product_a_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_b_id_fkey"
            columns: ["product_b_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_b_id_fkey"
            columns: ["product_b_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
          confidence: Json
          craftsmanship: number | null
          created_at: string | null
          formality: number | null
          id: string
          product_id: string
          source: string
          timelessness: number | null
          updated_at: string | null
          warmth: number | null
        }
        Insert: {
          assigned_by: string
          boldness?: number | null
          complexity?: number | null
          confidence?: Json
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          id?: string
          product_id: string
          source?: string
          timelessness?: number | null
          updated_at?: string | null
          warmth?: number | null
        }
        Update: {
          assigned_by?: string
          boldness?: number | null
          complexity?: number | null
          confidence?: Json
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          id?: string
          product_id?: string
          source?: string
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_style_spectrum_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_style_spectrum_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_styles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_styles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_user_dwell_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_user_dwell_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
          aesthete_model_version: string | null
          aesthete_vector: string | null
          aesthete_vector_at: string | null
          available_colors: string[] | null
          brand: string | null
          capture_provenance: Json | null
          capture_source: string | null
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
          field_capture_id: string | null
          finish: string | null
          finishes: string[] | null
          freight_class: string | null
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
          pricing_tiers: Json | null
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
          style_caption: string | null
          style_tags: string[] | null
          subcategory: string | null
          tags: string[] | null
          updated_at: string | null
          usage_notes: string | null
          vendor_contact: Json | null
          vendor_id: string | null
          vendor_sku: string | null
        }
        Insert: {
          aesthete_model_version?: string | null
          aesthete_vector?: string | null
          aesthete_vector_at?: string | null
          available_colors?: string[] | null
          brand?: string | null
          capture_provenance?: Json | null
          capture_source?: string | null
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
          field_capture_id?: string | null
          finish?: string | null
          finishes?: string[] | null
          freight_class?: string | null
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
          pricing_tiers?: Json | null
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
          style_caption?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          tags?: string[] | null
          updated_at?: string | null
          usage_notes?: string | null
          vendor_contact?: Json | null
          vendor_id?: string | null
          vendor_sku?: string | null
        }
        Update: {
          aesthete_model_version?: string | null
          aesthete_vector?: string | null
          aesthete_vector_at?: string | null
          available_colors?: string[] | null
          brand?: string | null
          capture_provenance?: Json | null
          capture_source?: string | null
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
          field_capture_id?: string | null
          finish?: string | null
          finishes?: string[] | null
          freight_class?: string | null
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
          pricing_tiers?: Json | null
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
          style_caption?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          tags?: string[] | null
          updated_at?: string | null
          usage_notes?: string | null
          vendor_contact?: Json | null
          vendor_id?: string | null
          vendor_sku?: string | null
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_catalog_equivalent_id_fkey"
            columns: ["catalog_equivalent_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_catalog_equivalent_id_fkey"
            columns: ["catalog_equivalent_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_catalog_equivalent_id_fkey"
            columns: ["catalog_equivalent_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_field_capture_id_fkey"
            columns: ["field_capture_id"]
            isOneToOne: false
            referencedRelation: "field_captures"
            referencedColumns: ["id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_promoted_from_id_fkey"
            columns: ["promoted_from_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_promoted_from_id_fkey"
            columns: ["promoted_from_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
          availability_changed_at: string | null
          availability_status: string
          avatar_url: string | null
          behavioral_tracking_opt_out: boolean
          bio: string | null
          business_name: string | null
          city: string | null
          created_at: string
          default_hourly_rate_cents: number | null
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
          sms_opt_in: boolean
          state: string | null
          stripe_customer_id: string | null
          total_engagement_score: number | null
          updated_at: string
          verified_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          availability_changed_at?: string | null
          availability_status?: string
          avatar_url?: string | null
          behavioral_tracking_opt_out?: boolean
          bio?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          default_hourly_rate_cents?: number | null
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
          sms_opt_in?: boolean
          state?: string | null
          stripe_customer_id?: string | null
          total_engagement_score?: number | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          availability_changed_at?: string | null
          availability_status?: string
          avatar_url?: string | null
          behavioral_tracking_opt_out?: boolean
          bio?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          default_hourly_rate_cents?: number | null
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
          sms_opt_in?: boolean
          state?: string | null
          stripe_customer_id?: string | null
          total_engagement_score?: number | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      project_boards: {
        Row: {
          background_color: string
          canvas_height: number
          canvas_width: number
          cover_image_url: string | null
          created_at: string
          id: string
          items: Json
          name: string
          project_id: string
          project_room_id: string | null
          sort_order: number
          source_board_id: string | null
        }
        Insert: {
          background_color?: string
          canvas_height?: number
          canvas_width?: number
          cover_image_url?: string | null
          created_at?: string
          id?: string
          items?: Json
          name: string
          project_id: string
          project_room_id?: string | null
          sort_order?: number
          source_board_id?: string | null
        }
        Update: {
          background_color?: string
          canvas_height?: number
          canvas_width?: number
          cover_image_url?: string | null
          created_at?: string
          id?: string
          items?: Json
          name?: string
          project_id?: string
          project_room_id?: string | null
          sort_order?: number
          source_board_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_boards_project_room_id_fkey"
            columns: ["project_room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
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
      project_documents: {
        Row: {
          anchor_id: string | null
          anchor_kind: string | null
          category: string | null
          client_visible: boolean
          created_at: string
          designer_client_id: string | null
          doc_type: string
          id: string
          project_id: string | null
          proposal_id: string | null
          section_key: string | null
          size_bytes: number | null
          status: string | null
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
          url: string | null
          version: string | null
          version_of: string | null
        }
        Insert: {
          anchor_id?: string | null
          anchor_kind?: string | null
          category?: string | null
          client_visible?: boolean
          created_at?: string
          designer_client_id?: string | null
          doc_type?: string
          id?: string
          project_id?: string | null
          proposal_id?: string | null
          section_key?: string | null
          size_bytes?: number | null
          status?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          url?: string | null
          version?: string | null
          version_of?: string | null
        }
        Update: {
          anchor_id?: string | null
          anchor_kind?: string | null
          category?: string | null
          client_visible?: boolean
          created_at?: string
          designer_client_id?: string | null
          doc_type?: string
          id?: string
          project_id?: string | null
          proposal_id?: string | null
          section_key?: string | null
          size_bytes?: number | null
          status?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          url?: string | null
          version?: string | null
          version_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_version_of_fkey"
            columns: ["version_of"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      project_ffe_items: {
        Row: {
          added_via: string | null
          blocked: boolean | null
          blocked_by_decision_id: string | null
          blocked_reason: string | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          created_at: string
          custom_fields: Json
          doc_code: string | null
          eta: string | null
          ffe_category: string | null
          id: string
          item_type: string
          last_status_change_at: string | null
          line_total_cents: number | null
          markup_percent: number | null
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
          source_decision_id: string | null
          source_proposal_item_id: string | null
          status: string
          trade_price_cents: number | null
          unit_price_cents: number | null
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          added_via?: string | null
          blocked?: boolean | null
          blocked_by_decision_id?: string | null
          blocked_reason?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          custom_fields?: Json
          doc_code?: string | null
          eta?: string | null
          ffe_category?: string | null
          id?: string
          item_type?: string
          last_status_change_at?: string | null
          line_total_cents?: number | null
          markup_percent?: number | null
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
          source_decision_id?: string | null
          source_proposal_item_id?: string | null
          status?: string
          trade_price_cents?: number | null
          unit_price_cents?: number | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          added_via?: string | null
          blocked?: boolean | null
          blocked_by_decision_id?: string | null
          blocked_reason?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          custom_fields?: Json
          doc_code?: string | null
          eta?: string | null
          ffe_category?: string | null
          id?: string
          item_type?: string
          last_status_change_at?: string | null
          line_total_cents?: number | null
          markup_percent?: number | null
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
          source_decision_id?: string | null
          source_proposal_item_id?: string | null
          status?: string
          trade_price_cents?: number | null
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
            foreignKeyName: "project_ffe_items_blocked_by_decision_id_fkey"
            columns: ["blocked_by_decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "project_ffe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "project_ffe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
            foreignKeyName: "project_ffe_items_source_decision_id_fkey"
            columns: ["source_decision_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ffe_items_source_decision_id_fkey"
            columns: ["source_decision_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
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
      project_parties: {
        Row: {
          company_name: string | null
          created_at: string
          created_by: string | null
          display_name: string
          email: string | null
          id: string
          party_kind: string
          phone: string | null
          phone_e164: string | null
          profile_id: string | null
          project_id: string
          sms_consent_status: string
          sms_consented_at: string | null
          sms_opt_out_at: string | null
          trade: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          email?: string | null
          id?: string
          party_kind: string
          phone?: string | null
          phone_e164?: string | null
          profile_id?: string | null
          project_id: string
          sms_consent_status?: string
          sms_consented_at?: string | null
          sms_opt_out_at?: string | null
          trade?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string | null
          id?: string
          party_kind?: string
          phone?: string | null
          phone_e164?: string | null
          profile_id?: string | null
          project_id?: string
          sms_consent_status?: string
          sms_consented_at?: string | null
          sms_opt_out_at?: string | null
          trade?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_parties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parties_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parties_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_parties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parties_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
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
          invoice_id: string | null
          label: string
          paid_at: string | null
          percentage: number
          phase_id: string | null
          project_id: string
          sort_order: number
          status: string
          stripe_session_id: string | null
          trigger_condition: string | null
          trigger_kind: string | null
          trigger_section_key: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          label: string
          paid_at?: string | null
          percentage: number
          phase_id?: string | null
          project_id: string
          sort_order?: number
          status?: string
          stripe_session_id?: string | null
          trigger_condition?: string | null
          trigger_kind?: string | null
          trigger_section_key?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          label?: string
          paid_at?: string | null
          percentage?: number
          phase_id?: string | null
          project_id?: string
          sort_order?: number
          status?: string
          stripe_session_id?: string | null
          trigger_condition?: string | null
          trigger_kind?: string | null
          trigger_section_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_payment_milestones_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
          anchor_date: string | null
          completed_at: string | null
          created_at: string
          deliverables: Json | null
          duration_days: number | null
          duration_weeks: number | null
          estimated_hours: number | null
          fee_cents: number | null
          follows_phase_id: string | null
          gate_condition: string | null
          id: string
          lane: string
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
          anchor_date?: string | null
          completed_at?: string | null
          created_at?: string
          deliverables?: Json | null
          duration_days?: number | null
          duration_weeks?: number | null
          estimated_hours?: number | null
          fee_cents?: number | null
          follows_phase_id?: string | null
          gate_condition?: string | null
          id?: string
          lane?: string
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
          anchor_date?: string | null
          completed_at?: string | null
          created_at?: string
          deliverables?: Json | null
          duration_days?: number | null
          duration_weeks?: number | null
          estimated_hours?: number | null
          fee_cents?: number | null
          follows_phase_id?: string | null
          gate_condition?: string | null
          id?: string
          lane?: string
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
            foreignKeyName: "project_phases_follows_phase_id_fkey"
            columns: ["follows_phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "project_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "project_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          blocked_by_item_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          estimate_minutes: number | null
          id: string
          owner: string
          owner_party_id: string | null
          phase_key: string | null
          project_id: string
          section_key: string | null
          seq_after_task_id: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          blocked_by_item_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimate_minutes?: number | null
          id?: string
          owner?: string
          owner_party_id?: string | null
          phase_key?: string | null
          project_id: string
          section_key?: string | null
          seq_after_task_id?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          blocked_by_item_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimate_minutes?: number | null
          id?: string
          owner?: string
          owner_party_id?: string | null
          phase_key?: string | null
          project_id?: string
          section_key?: string | null
          seq_after_task_id?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_blocked_by_item_id_fkey"
            columns: ["blocked_by_item_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_blocked_by_item_id_fkey"
            columns: ["blocked_by_item_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_owner_party_id_fkey"
            columns: ["owner_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_seq_after_task_id_fkey"
            columns: ["seq_after_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_seq_after_task_id_fkey"
            columns: ["seq_after_task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "project_tasks_seq_after_task_id_fkey"
            columns: ["seq_after_task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["waiting_on_task_id"]
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
      project_time_entries: {
        Row: {
          activity: string | null
          billable: boolean
          created_at: string
          duration_minutes: number | null
          hourly_rate_cents: number | null
          id: string
          idle_seconds: number | null
          invoice_id: string | null
          notes: string | null
          phase_key: string | null
          project_id: string
          raw_seconds: number | null
          source: string
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity?: string | null
          billable?: boolean
          created_at?: string
          duration_minutes?: number | null
          hourly_rate_cents?: number | null
          id?: string
          idle_seconds?: number | null
          invoice_id?: string | null
          notes?: string | null
          phase_key?: string | null
          project_id: string
          raw_seconds?: number | null
          source?: string
          started_at?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity?: string | null
          billable?: boolean
          created_at?: string
          duration_minutes?: number | null
          hourly_rate_cents?: number | null
          id?: string
          idle_seconds?: number | null
          invoice_id?: string | null
          notes?: string | null
          phase_key?: string | null
          project_id?: string
          raw_seconds?: number | null
          source?: string
          started_at?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_time_entries_invoice"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "project_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["waiting_on_task_id"]
          },
          {
            foreignKeyName: "project_time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_entries_user_id_fkey"
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
          closure_checklist: Json | null
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
          portfolio_snapshot: Json | null
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
          closure_checklist?: Json | null
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
          portfolio_snapshot?: Json | null
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
          closure_checklist?: Json | null
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
          portfolio_snapshot?: Json | null
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "promotion_audit_log_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "promotion_audit_log_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "promotion_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "promotion_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      proposal_board_items: {
        Row: {
          board_id: string
          capture_id: string | null
          content: string | null
          created_at: string
          data: Json
          height: number | null
          id: string
          image_url: string | null
          locked: boolean
          palette_id: string | null
          product_id: string | null
          rotation: number
          type: string
          updated_at: string
          width: number
          x: number
          y: number
          z_index: number
        }
        Insert: {
          board_id: string
          capture_id?: string | null
          content?: string | null
          created_at?: string
          data?: Json
          height?: number | null
          id?: string
          image_url?: string | null
          locked?: boolean
          palette_id?: string | null
          product_id?: string | null
          rotation?: number
          type: string
          updated_at?: string
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          board_id?: string
          capture_id?: string | null
          content?: string | null
          created_at?: string
          data?: Json
          height?: number | null
          id?: string
          image_url?: string | null
          locked?: boolean
          palette_id?: string | null
          product_id?: string | null
          rotation?: number
          type?: string
          updated_at?: string
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_board_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "proposal_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_board_items_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "proposal_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_board_items_palette_id_fkey"
            columns: ["palette_id"]
            isOneToOne: false
            referencedRelation: "proposal_palettes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_board_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_board_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_board_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_board_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_board_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      proposal_boards: {
        Row: {
          background_color: string
          canvas_height: number
          canvas_width: number
          cover_image_url: string | null
          created_at: string
          id: string
          name: string
          project_id: string | null
          proposal_id: string | null
          scope_room_id: string | null
          sections: Json
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          background_color?: string
          canvas_height?: number
          canvas_width?: number
          cover_image_url?: string | null
          created_at?: string
          id?: string
          name: string
          project_id?: string | null
          proposal_id?: string | null
          scope_room_id?: string | null
          sections?: Json
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          background_color?: string
          canvas_height?: number
          canvas_width?: number
          cover_image_url?: string | null
          created_at?: string
          id?: string
          name?: string
          project_id?: string | null
          proposal_id?: string | null
          scope_room_id?: string | null
          sections?: Json
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "proposal_boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_boards_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_boards_scope_room_id_fkey"
            columns: ["scope_room_id"]
            isOneToOne: false
            referencedRelation: "proposal_scope_rooms"
            referencedColumns: ["id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_captures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
          custom_fields: Json
          description: string | null
          doc_code: string | null
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
          custom_fields?: Json
          description?: string | null
          doc_code?: string | null
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
          custom_fields?: Json
          description?: string | null
          doc_code?: string | null
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "proposal_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
          anchor_date: string | null
          created_at: string
          deliverables: Json | null
          duration_days: number | null
          duration_weeks: number | null
          fee_cents: number
          follows_phase_id: string | null
          gate_condition: string | null
          id: string
          lane: string
          name: string
          phase_key: string | null
          proposal_id: string
          revision_limit: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          anchor_date?: string | null
          created_at?: string
          deliverables?: Json | null
          duration_days?: number | null
          duration_weeks?: number | null
          fee_cents?: number
          follows_phase_id?: string | null
          gate_condition?: string | null
          id?: string
          lane?: string
          name: string
          phase_key?: string | null
          proposal_id: string
          revision_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          anchor_date?: string | null
          created_at?: string
          deliverables?: Json | null
          duration_days?: number | null
          duration_weeks?: number | null
          fee_cents?: number
          follows_phase_id?: string | null
          gate_condition?: string | null
          id?: string
          lane?: string
          name?: string
          phase_key?: string | null
          proposal_id?: string
          revision_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_phases_follows_phase_id_fkey"
            columns: ["follows_phase_id"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_phases_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_schedule_milestones: {
        Row: {
          anchor_date: string
          created_at: string
          id: string
          kind: string
          name: string
          phase_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          anchor_date: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          phase_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          anchor_date?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          phase_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_schedule_milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
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
          designer_client_id: string | null
          designer_id: string
          discount_amount: number | null
          discount_percent: number | null
          feedback_enabled: boolean
          id: string
          last_nudged_at: string | null
          nudge_count: number
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
          designer_client_id?: string | null
          designer_id: string
          discount_amount?: number | null
          discount_percent?: number | null
          feedback_enabled?: boolean
          id?: string
          last_nudged_at?: string | null
          nudge_count?: number
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
          designer_client_id?: string | null
          designer_id?: string
          discount_amount?: number | null
          discount_percent?: number | null
          feedback_enabled?: boolean
          id?: string
          last_nudged_at?: string | null
          nudge_count?: number
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
            foreignKeyName: "proposals_designer_client_id_fkey"
            columns: ["designer_client_id"]
            isOneToOne: false
            referencedRelation: "designer_clients"
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
          acknowledged_at: string | null
          confirmed_eta: string | null
          created_at: string
          delivered_date: string | null
          designer_id: string
          id: string
          is_patina_catalog: boolean
          notes: string | null
          payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          po_document_path: string | null
          po_number: string | null
          project_id: string
          sent_at: string | null
          ship_to: string | null
          sidemark: string | null
          status: string
          total_cents: number
          updated_at: string
          vendor_id: string
          vendor_po_number: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          confirmed_eta?: string | null
          created_at?: string
          delivered_date?: string | null
          designer_id: string
          id?: string
          is_patina_catalog?: boolean
          notes?: string | null
          payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          po_document_path?: string | null
          po_number?: string | null
          project_id: string
          sent_at?: string | null
          ship_to?: string | null
          sidemark?: string | null
          status?: string
          total_cents?: number
          updated_at?: string
          vendor_id: string
          vendor_po_number?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          confirmed_eta?: string | null
          created_at?: string
          delivered_date?: string | null
          designer_id?: string
          id?: string
          is_patina_catalog?: boolean
          notes?: string | null
          payment_pattern?: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          po_document_path?: string | null
          po_number?: string | null
          project_id?: string
          sent_at?: string | null
          ship_to?: string | null
          sidemark?: string | null
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
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
      quiz_option_loadings: {
        Row: {
          archetype_loadings: Json | null
          budget: Json | null
          image_embedding: string | null
          material_loadings: Json | null
          option_key: string
          other: Json | null
          question_key: string
          question_weight: number
          spectrum_deltas: Json
        }
        Insert: {
          archetype_loadings?: Json | null
          budget?: Json | null
          image_embedding?: string | null
          material_loadings?: Json | null
          option_key: string
          other?: Json | null
          question_key: string
          question_weight?: number
          spectrum_deltas?: Json
        }
        Update: {
          archetype_loadings?: Json | null
          budget?: Json | null
          image_embedding?: string | null
          material_loadings?: Json | null
          option_key?: string
          other?: Json | null
          question_key?: string
          question_weight?: number
          spectrum_deltas?: Json
        }
        Relationships: []
      }
      quiz_rate_limits: {
        Row: {
          ip_hash: string
          n: number
          window_start: string
        }
        Insert: {
          ip_hash: string
          n?: number
          window_start: string
        }
        Update: {
          ip_hash?: string
          n?: number
          window_start?: string
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
            foreignKeyName: "room_scan_associations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "open_design_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scan_associations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
          project_room_id: string | null
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
          project_room_id?: string | null
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
          project_room_id?: string | null
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "room_scans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_scans_project_room_id_fkey"
            columns: ["project_room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "saved_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "saved_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      schedule_milestones: {
        Row: {
          anchor_date: string | null
          created_at: string
          id: string
          kind: string
          name: string
          offset_days: number | null
          phase_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          anchor_date?: string | null
          created_at?: string
          id?: string
          kind?: string
          name: string
          offset_days?: number | null
          phase_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          anchor_date?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          offset_days?: number | null
          phase_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_revisions: {
        Row: {
          actor: string | null
          created_at: string
          cut_at: string
          id: string
          phase_snapshots: Json
          project_id: string
          reason: string | null
          v: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          cut_at?: string
          id?: string
          phase_snapshots?: Json
          project_id: string
          reason?: string | null
          v: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          cut_at?: string
          id?: string
          phase_snapshots?: Json
          project_id?: string
          reason?: string | null
          v?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "schedule_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
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
      signature_biases: {
        Row: {
          description: string | null
          designer_id: string
          direction: string
          displayed_strength: number | null
          evidence: Json | null
          feature_group: string
          id: string
          learned_strength: number | null
          name: string
          status: string
          updated_at: string | null
          version: number
        }
        Insert: {
          description?: string | null
          designer_id: string
          direction: string
          displayed_strength?: number | null
          evidence?: Json | null
          feature_group: string
          id?: string
          learned_strength?: number | null
          name: string
          status?: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          description?: string | null
          designer_id?: string
          direction?: string
          displayed_strength?: number | null
          evidence?: Json | null
          feature_group?: string
          id?: string
          learned_strength?: number | null
          name?: string
          status?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: []
      }
      sms_conversations: {
        Row: {
          active_project_id: string | null
          created_at: string
          id: string
          last_inbound_at: string | null
          last_outbound_at: string | null
          party_id: string | null
          phone_e164: string
          state: string
          state_context: Json
          twilio_number: string
          updated_at: string
        }
        Insert: {
          active_project_id?: string | null
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          party_id?: string | null
          phone_e164: string
          state?: string
          state_context?: Json
          twilio_number: string
          updated_at?: string
        }
        Update: {
          active_project_id?: string | null
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          party_id?: string | null
          phone_e164?: string
          state?: string
          state_context?: Json
          twilio_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_active_project_id_fkey"
            columns: ["active_project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "sms_conversations_active_project_id_fkey"
            columns: ["active_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_conversations_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          applied_effect: Json | null
          body: string | null
          confidence: number | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          matched_coordination_item_id: string | null
          matched_task_id: string | null
          media: Json
          needs_review: boolean
          parsed_intent: Json | null
          party_id: string | null
          project_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          template_key: string | null
          twilio_sid: string | null
          twilio_status: string | null
        }
        Insert: {
          applied_effect?: Json | null
          body?: string | null
          confidence?: number | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          matched_coordination_item_id?: string | null
          matched_task_id?: string | null
          media?: Json
          needs_review?: boolean
          parsed_intent?: Json | null
          party_id?: string | null
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          template_key?: string | null
          twilio_sid?: string | null
          twilio_status?: string | null
        }
        Update: {
          applied_effect?: Json | null
          body?: string | null
          confidence?: number | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          matched_coordination_item_id?: string | null
          matched_task_id?: string | null
          media?: Json
          needs_review?: boolean
          parsed_intent?: Json | null
          party_id?: string | null
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          template_key?: string | null
          twilio_sid?: string | null
          twilio_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_matched_coordination_item_id_fkey"
            columns: ["matched_coordination_item_id"]
            isOneToOne: false
            referencedRelation: "client_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_matched_coordination_item_id_fkey"
            columns: ["matched_coordination_item_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["blocking_item_id"]
          },
          {
            foreignKeyName: "sms_messages_matched_task_id_fkey"
            columns: ["matched_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_matched_task_id_fkey"
            columns: ["matched_task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "sms_messages_matched_task_id_fkey"
            columns: ["matched_task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["waiting_on_task_id"]
          },
          {
            foreignKeyName: "sms_messages_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "sms_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "spatial_context_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "spatial_context_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      spec_field_defs: {
        Row: {
          created_at: string
          field_key: string
          id: string
          kind: string
          name: string
          project_id: string | null
          proposal_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          kind?: string
          name: string
          project_id?: string | null
          proposal_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          kind?: string
          name?: string
          project_id?: string | null
          proposal_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spec_field_defs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "spec_field_defs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spec_field_defs_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "spectrum_calibration_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "spectrum_calibration_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      stripe_webhook_events: {
        Row: {
          id: string
          payload: Json | null
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      studio_invoice_counters: {
        Row: {
          next_number: number
          studio_id: string
        }
        Insert: {
          next_number?: number
          studio_id: string
        }
        Update: {
          next_number?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_invoice_counters_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_invoice_counters_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "v_studios"
            referencedColumns: ["id"]
          },
        ]
      }
      style_centroids: {
        Row: {
          centroid: string
          computed_at: string | null
          n_products: number
          style_id: string
        }
        Insert: {
          centroid: string
          computed_at?: string | null
          n_products: number
          style_id: string
        }
        Update: {
          centroid?: string
          computed_at?: string | null
          n_products?: number
          style_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "style_centroids_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: true
            referencedRelation: "styles"
            referencedColumns: ["id"]
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
      suggestion_events: {
        Row: {
          action: string
          board_id: string | null
          context: string
          created_at: string
          designer_id: string
          feedback_id: string | null
          id: string
          product_id: string
          rank: number | null
        }
        Insert: {
          action: string
          board_id?: string | null
          context: string
          created_at?: string
          designer_id?: string
          feedback_id?: string | null
          id?: string
          product_id: string
          rank?: number | null
        }
        Update: {
          action?: string
          board_id?: string | null
          context?: string
          created_at?: string
          designer_id?: string
          feedback_id?: string | null
          id?: string
          product_id?: string
          rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_events_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "proposal_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_events_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "item_feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "suggestion_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "suggestion_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "suggestion_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
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
      taste_corrections: {
        Row: {
          client_profile_id: string | null
          created_at: string | null
          designer_id: string
          direction: Json
          free_text: string | null
          id: number
          product_id: string | null
          replacement_product_id: string | null
          subject: string
          surface: string | null
        }
        Insert: {
          client_profile_id?: string | null
          created_at?: string | null
          designer_id: string
          direction?: Json
          free_text?: string | null
          id?: never
          product_id?: string | null
          replacement_product_id?: string | null
          subject: string
          surface?: string | null
        }
        Update: {
          client_profile_id?: string | null
          created_at?: string | null
          designer_id?: string
          direction?: Json
          free_text?: string | null
          id?: never
          product_id?: string | null
          replacement_product_id?: string | null
          subject?: string
          surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_taste_corrections_client_profile"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_style_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_corrections_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_corrections_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_corrections_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_corrections_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_corrections_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
        ]
      }
      taste_judgments: {
        Row: {
          choice: string
          client_profile_id: string | null
          context: string
          created_at: string | null
          designer_id: string
          id: number
          kind: string
          latency_ms: number | null
          product_a: string
          product_b: string
          session_id: string | null
        }
        Insert: {
          choice: string
          client_profile_id?: string | null
          context?: string
          created_at?: string | null
          designer_id: string
          id?: never
          kind?: string
          latency_ms?: number | null
          product_a: string
          product_b: string
          session_id?: string | null
        }
        Update: {
          choice?: string
          client_profile_id?: string | null
          context?: string
          created_at?: string | null
          designer_id?: string
          id?: never
          kind?: string
          latency_ms?: number | null
          product_a?: string
          product_b?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_taste_judgments_client_profile"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_style_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_judgments_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_judgments_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_judgments_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_judgments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "teaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      taste_probe_queue: {
        Row: {
          answered_judgment_id: number | null
          created_at: string | null
          designer_id: string
          due_at: string
          id: number
          product_a: string
          product_b: string
          source_judgment_id: number
          status: string
        }
        Insert: {
          answered_judgment_id?: number | null
          created_at?: string | null
          designer_id: string
          due_at: string
          id?: never
          product_a: string
          product_b: string
          source_judgment_id: number
          status?: string
        }
        Update: {
          answered_judgment_id?: number | null
          created_at?: string | null
          designer_id?: string
          due_at?: string
          id?: never
          product_a?: string
          product_b?: string
          source_judgment_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "taste_probe_queue_answered_judgment_id_fkey"
            columns: ["answered_judgment_id"]
            isOneToOne: false
            referencedRelation: "taste_judgments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_a_fkey"
            columns: ["product_a"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_product_b_fkey"
            columns: ["product_b"]
            isOneToOne: false
            referencedRelation: "v_promotion_candidates"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "taste_probe_queue_source_judgment_id_fkey"
            columns: ["source_judgment_id"]
            isOneToOne: false
            referencedRelation: "taste_judgments"
            referencedColumns: ["id"]
          },
        ]
      }
      taste_rules: {
        Row: {
          action: string
          created_at: string | null
          designer_id: string | null
          id: string
          magnitude: number | null
          owner_scope: string
          predicate: Json
          scope: string
          scope_value: string | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string | null
          designer_id?: string | null
          id?: string
          magnitude?: number | null
          owner_scope: string
          predicate: Json
          scope?: string
          scope_value?: string | null
          status?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          designer_id?: string | null
          id?: string
          magnitude?: number | null
          owner_scope?: string
          predicate?: Json
          scope?: string
          scope_value?: string | null
          status?: string
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "teaching_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "teaching_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "teaching_validations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "teaching_validations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      user_sessions: {
        Row: {
          auth_session_id: string | null
          created_at: string
          id: string
          ip: string | null
          last_active_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_session_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_active_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_session_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_active_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
            referencedRelation: "v_aesthete_catalog_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "user_wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_personal_input"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "user_wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_aesthete_studio_input"
            referencedColumns: ["product_id"]
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
      vendor_quote_requests: {
        Row: {
          created_at: string
          designer_id: string
          id: string
          message: string | null
          scope: string | null
          sent_at: string | null
          status: string
          timeline: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          designer_id: string
          id?: string
          message?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          designer_id?: string
          id?: string
          message?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_quote_requests_vendor_id_fkey"
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
          contact_profile_id: string | null
          created_at: string | null
          default_payment_terms:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          designer_rating_avg: number | null
          founded_year: number | null
          founding_circle: boolean
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
          orders_email: string | null
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
          trade_account_email: string | null
          trade_account_established_at: string | null
          trade_portal_url: string | null
          trade_terms: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          brand_story?: Json | null
          contact_info?: Json | null
          contact_profile_id?: string | null
          created_at?: string | null
          default_payment_terms?:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          designer_rating_avg?: number | null
          founded_year?: number | null
          founding_circle?: boolean
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
          orders_email?: string | null
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
          trade_account_email?: string | null
          trade_account_established_at?: string | null
          trade_portal_url?: string | null
          trade_terms?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          brand_story?: Json | null
          contact_info?: Json | null
          contact_profile_id?: string | null
          created_at?: string | null
          default_payment_terms?:
            | Database["public"]["Enums"]["purchase_order_payment_pattern"]
            | null
          designer_rating_avg?: number | null
          founded_year?: number | null
          founding_circle?: boolean
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
          orders_email?: string | null
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
          trade_account_email?: string | null
          trade_account_established_at?: string | null
          trade_portal_url?: string | null
          trade_terms?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_contact_profile_id_fkey"
            columns: ["contact_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_contact_profile_id_fkey"
            columns: ["contact_profile_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
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
          channel: string | null
          company_name: string | null
          converted_at: string | null
          created_at: string
          cta_text: string | null
          disqualified_reason: string | null
          email: string
          fbclid: string | null
          first_touch_attribution: Json | null
          full_name: string | null
          gclid: string | null
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
          channel?: string | null
          company_name?: string | null
          converted_at?: string | null
          created_at?: string
          cta_text?: string | null
          disqualified_reason?: string | null
          email: string
          fbclid?: string | null
          first_touch_attribution?: Json | null
          full_name?: string | null
          gclid?: string | null
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
          channel?: string | null
          company_name?: string | null
          converted_at?: string | null
          created_at?: string
          cta_text?: string | null
          disqualified_reason?: string | null
          email?: string
          fbclid?: string | null
          first_touch_attribution?: Json | null
          full_name?: string | null
          gclid?: string | null
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
      weekly_pulses: {
        Row: {
          anchor_id: string | null
          anchor_kind: string
          body: string | null
          created_at: string
          designer_id: string
          id: string
          project_id: string
          sent_at: string | null
          sent_message_id: string | null
          status: string
          subject: string | null
          updated_at: string
          week_of: string
        }
        Insert: {
          anchor_id?: string | null
          anchor_kind?: string
          body?: string | null
          created_at?: string
          designer_id: string
          id?: string
          project_id: string
          sent_at?: string | null
          sent_message_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          week_of: string
        }
        Update: {
          anchor_id?: string | null
          anchor_kind?: string
          body?: string | null
          created_at?: string
          designer_id?: string
          id?: string
          project_id?: string
          sent_at?: string | null
          sent_message_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_pulses_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_pulses_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_pulses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "weekly_pulses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_pulses_sent_message_id_fkey"
            columns: ["sent_message_id"]
            isOneToOne: false
            referencedRelation: "comms_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      why_phrase_alts: {
        Row: {
          band: string
          sort: number | null
          template: string
          term: string
          variant: number
        }
        Insert: {
          band: string
          sort?: number | null
          template: string
          term: string
          variant?: number
        }
        Update: {
          band?: string
          sort?: number | null
          template?: string
          term?: string
          variant?: number
        }
        Relationships: []
      }
      why_phrases: {
        Row: {
          band: string
          sort: number | null
          template: string
          term: string
        }
        Insert: {
          band: string
          sort?: number | null
          template: string
          term: string
        }
        Update: {
          band?: string
          sort?: number | null
          template?: string
          term?: string
        }
        Relationships: []
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
      coordination_court_summary: {
        Row: {
          court: string | null
          next_due: string | null
          open_count: number | null
          overdue_count: number | null
          project_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "client_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      document_state: {
        Row: {
          active_section: string | null
          awaiting_inspection_count: number | null
          blocked_item_count: number | null
          client_name: string | null
          client_profile_id: string | null
          current_phase: string | null
          designer_id: string | null
          draft_po_label: string | null
          draft_unsent_po_count: number | null
          due_task_count: number | null
          due_task_title: string | null
          earliest_overdue_due: string | null
          earliest_task_due: string | null
          engagement_id: string | null
          engagement_kind: string | null
          in_flight_count: number | null
          installed_count: number | null
          is_archived: boolean | null
          is_paused: boolean | null
          item_count: number | null
          items_in_your_court: number | null
          lead_id: string | null
          lead_response_deadline: string | null
          lead_status: string | null
          oldest_draft_po_created_at: string | null
          oldest_unacked_sent_at: string | null
          open_claim_count: number | null
          open_claim_po: string | null
          open_items_count: number | null
          overdue_decision_count: number | null
          project_id: string | null
          project_status: string | null
          proposal_id: string | null
          proposal_last_opened_at: string | null
          proposal_open_count: number | null
          proposal_sent_at: string | null
          proposal_status: string | null
          proposal_updated_at: string | null
          proposal_viewed_at: string | null
          pulse_week_of: string | null
          title: string | null
          unacked_po_count: number | null
          unacked_po_label: string | null
          unsent_pulse_count: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      field_activity_summary: {
        Row: {
          awaiting_reply_count: number | null
          overdue_field_task_count: number | null
          project_id: string | null
          unreviewed_sms_count: number | null
        }
        Insert: {
          awaiting_reply_count?: never
          overdue_field_task_count?: never
          project_id?: string | null
          unreviewed_sms_count?: never
        }
        Update: {
          awaiting_reply_count?: never
          overdue_field_task_count?: never
          project_id?: string | null
          unreviewed_sms_count?: never
        }
        Relationships: []
      }
      margin_items: {
        Row: {
          anchor_id: string | null
          anchor_kind: string | null
          detail: string | null
          item_id: string | null
          kind: string | null
          payload: Json | null
          project_id: string | null
          proposal_id: string | null
          state: string | null
          title: string | null
          ts: string | null
        }
        Relationships: []
      }
      marketplace_vitals: {
        Row: {
          computed_at: string | null
          metric_key: string | null
          prev_value: number | null
          value: number | null
        }
        Relationships: []
      }
      open_design_requests: {
        Row: {
          budget_range: string | null
          created_at: string | null
          floor_area: number | null
          id: string | null
          location_city: string | null
          location_state: string | null
          project_description: string | null
          project_type: string | null
          room_type: string | null
          scan_count: number | null
          thumbnail_url: string | null
          timeline: string | null
        }
        Relationships: []
      }
      people_directory: {
        Row: {
          designer_id: string | null
          display_name: string | null
          email: string | null
          last_touch_at: string | null
          meta: Json | null
          person_id: string | null
          phone: string | null
          profile_id: string | null
          project_id: string | null
          role: string | null
          status_raw: string | null
        }
        Relationships: []
      }
      product_behavior_stats: {
        Row: {
          product_id: string | null
          saves: number | null
          skips: number | null
          smoothed_save_rate: number | null
          views: number | null
        }
        Relationships: []
      }
      project_unbilled_time: {
        Row: {
          amount_cents: number | null
          duration_minutes: number | null
          id: string | null
          notes: string | null
          phase_key: string | null
          project_id: string | null
          resolved_rate_cents: number | null
          started_at: string | null
          task_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "project_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_blocked_state"
            referencedColumns: ["waiting_on_task_id"]
          },
          {
            foreignKeyName: "project_time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_scores"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
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
      task_blocked_state: {
        Row: {
          blocked_by_open_item: boolean | null
          blocked_by_sequence: boolean | null
          blocking_item_court: string | null
          blocking_item_id: string | null
          project_id: string | null
          task_id: string | null
          waiting_on_task_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "field_activity_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      v_aesthete_catalog_input: {
        Row: {
          aesthete_vector: string | null
          category: string | null
          commission_rate: number | null
          created_at: string | null
          description: string | null
          embedding: string | null
          material_tags: string[] | null
          materials: string[] | null
          name: string | null
          product_id: string | null
          style_tags: string[] | null
          subcategory: string | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          aesthete_vector?: string | null
          category?: string | null
          commission_rate?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          material_tags?: string[] | null
          materials?: string[] | null
          name?: string | null
          product_id?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          aesthete_vector?: string | null
          category?: string | null
          commission_rate?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          material_tags?: string[] | null
          materials?: string[] | null
          name?: string | null
          product_id?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_aesthete_personal_input: {
        Row: {
          captured_at: string | null
          description: string | null
          embedding: string | null
          material_tags: string[] | null
          materials: string[] | null
          name: string | null
          owner_user_id: string | null
          product_id: string | null
          style_tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          captured_at?: string | null
          description?: string | null
          embedding?: string | null
          material_tags?: string[] | null
          materials?: string[] | null
          name?: string | null
          owner_user_id?: string | null
          product_id?: string | null
          style_tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          captured_at?: string | null
          description?: string | null
          embedding?: string | null
          material_tags?: string[] | null
          materials?: string[] | null
          name?: string | null
          owner_user_id?: string | null
          product_id?: string | null
          style_tags?: string[] | null
          updated_at?: string | null
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
        ]
      }
      v_aesthete_studio_input: {
        Row: {
          captured_at: string | null
          category: string | null
          description: string | null
          embedding: string | null
          material_tags: string[] | null
          materials: string[] | null
          name: string | null
          product_id: string | null
          promoted_at: string | null
          studio_id: string | null
          style_tags: string[] | null
          subcategory: string | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          captured_at?: string | null
          category?: string | null
          description?: string | null
          embedding?: string | null
          material_tags?: string[] | null
          materials?: string[] | null
          name?: string | null
          product_id?: string | null
          promoted_at?: string | null
          studio_id?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          captured_at?: string | null
          category?: string | null
          description?: string | null
          embedding?: string | null
          material_tags?: string[] | null
          materials?: string[] | null
          name?: string | null
          product_id?: string | null
          promoted_at?: string | null
          studio_id?: string | null
          style_tags?: string[] | null
          subcategory?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
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
      v_house_taste_public: {
        Row: {
          boldness: number | null
          complexity: number | null
          craftsmanship: number | null
          created_at: string | null
          formality: number | null
          status: string | null
          timelessness: number | null
          version: number | null
          warmth: number | null
        }
        Insert: {
          boldness?: number | null
          complexity?: number | null
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          status?: string | null
          timelessness?: number | null
          version?: number | null
          warmth?: number | null
        }
        Update: {
          boldness?: number | null
          complexity?: number | null
          craftsmanship?: number | null
          created_at?: string | null
          formality?: number | null
          status?: string | null
          timelessness?: number | null
          version?: number | null
          warmth?: number | null
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
      v_vendor_studio_stats: {
        Row: {
          lifetime_value_cents: number | null
          projects_used_count: number | null
          studio_id: string | null
          studio_item_count: number | null
          unresolved_damage_count: number | null
          vendor_id: string | null
        }
        Relationships: [
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
    }
    Functions: {
      _ae_pick_why_phrase: {
        Args: { p_band: string; p_seed: string; p_term: string }
        Returns: string
      }
      _aesthete_budget_term: {
        Args: {
          p_bmax: number
          p_bmin: number
          p_craft: number
          p_has_story: boolean
          p_omega: number
          p_price: number
        }
        Returns: {
          over_anchor: boolean
          softened: boolean
          t: number
        }[]
      }
      _aesthete_context_term: {
        Args: { p_dims: Json; p_room_l: number; p_room_w: number }
        Returns: number
      }
      _aesthete_function_term: {
        Args: {
          p_comfort: number
          p_complexity: number
          p_durability: string[]
          p_flexibility: number
          p_fp: Json
          p_primary_function: string
        }
        Returns: number
      }
      _aesthete_geometric_median: {
        Args: { p_vectors: string[] }
        Returns: Record<string, unknown>
      }
      _aesthete_interpretable_groups: { Args: never; Returns: string[] }
      _aesthete_material_bucket: {
        Args: { p_material: string }
        Returns: string
      }
      _aesthete_material_color_term: {
        Args: {
          p_aff: Json
          p_client_warmth: number
          p_color_temp: number
          p_materials: string[]
        }
        Returns: number
      }
      _aesthete_phi: { Args: { p_product_id: string }; Returns: number[] }
      _aesthete_primary_archetype: {
        Args: { p_product_id: string }
        Returns: string
      }
      _aesthete_product_spectrum: {
        Args: { p_product_id: string }
        Returns: {
          conf: Json
          origin: string
          spectrums: Json
        }[]
      }
      _aesthete_rule_cond: {
        Args: { p_attrs: Json; p_cond: Json }
        Returns: boolean
      }
      _aesthete_rule_matches: {
        Args: { p_attrs: Json; p_predicate: Json }
        Returns: boolean
      }
      _aesthete_spectrum_distance: {
        Args: { p_cs: Json; p_ps: Json }
        Returns: number
      }
      _aesthete_spectrum_term: {
        Args: { p_cc: Json; p_cs: Json; p_pc: Json; p_ps: Json }
        Returns: number
      }
      _aesthete_taste_term: {
        Args: { p_product_id: string; p_theta: number[] }
        Returns: number
      }
      _aesthete_theta_blend: {
        Args: { p_theta_d: number[]; p_theta_h: number[]; p_w_eff: number }
        Returns: number[]
      }
      _aesthete_utilization: { Args: { p_ratio: number }; Returns: number }
      _compute_quiz_profile: { Args: { p_answers: Json }; Returns: Json }
      _primary_studio_for: { Args: { p_user: string }; Returns: string }
      _provision_studio: {
        Args: { p_name: string; p_user_id: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_design_request: { Args: { p_lead_id: string }; Returns: Json }
      accept_workspace_invitation: {
        Args: { p_token: string }
        Returns: {
          organization_id: string
          organization_name: string
        }[]
      }
      activate_house_taste: { Args: { p_version: number }; Returns: undefined }
      activate_project_v2: { Args: { input: Json }; Returns: string }
      activate_proposal_as_project: {
        Args: { p_proposal_id: string; p_start_date?: string }
        Returns: string
      }
      advance_concierge_order: {
        Args: {
          p_actor: string
          p_force?: boolean
          p_id: string
          p_note?: string
          p_to_stage: string
        }
        Returns: Json
      }
      aesthete_ask_knn: {
        Args: { p_embedding: string; p_filters?: Json }
        Returns: {
          match_source: string
          product_id: string
          rank: number
        }[]
      }
      aesthete_dev_demo_seed: { Args: never; Returns: string }
      aesthete_house_portfolio_nightly: { Args: never; Returns: Json }
      aesthete_jobs_janitor: { Args: never; Returns: Json }
      aesthete_quiz_janitor: { Args: never; Returns: Json }
      aesthete_search: {
        Args: { p_filters?: Json; p_query: string }
        Returns: {
          match_source: string
          product_id: string
          rank: number
        }[]
      }
      agent_queue_stats: {
        Args: never
        Returns: {
          oldest_created_at: string
          status: string
          task_count: number
        }[]
      }
      aggregate_user_style_signals: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      app_setting: { Args: { p_name: string }; Returns: string }
      apply_decision: {
        Args: {
          p_decision_id: string
          p_selected_by?: string
          p_selected_option_id: string
        }
        Returns: undefined
      }
      apply_designer_reliability: {
        Args: {
          p_confidence_map?: Json
          p_designer_id: string
          p_reliability: number
          p_style_confidence?: Json
        }
        Returns: Json
      }
      apply_field_effect: {
        Args: {
          p_effect: Json
          p_party_id: string
          p_sms_message_id?: string
          p_source?: string
        }
        Returns: Json
      }
      apply_invoice_payment_effects: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      apply_phase_template: {
        Args: { p_proposal_id: string; p_template_slug: string }
        Returns: string[]
      }
      apply_scope_change: { Args: { p_request_id: string }; Returns: undefined }
      apply_starvation_decay: { Args: never; Returns: Json }
      apply_taste_refit: {
        Args: {
          p_designer_id: string
          p_diagnostics?: Json
          p_theta: number[]
          p_watermark: string
        }
        Returns: Json
      }
      assign_po_number: {
        Args: { p_po_id: string }
        Returns: {
          acknowledged_at: string | null
          confirmed_eta: string | null
          created_at: string
          delivered_date: string | null
          designer_id: string
          id: string
          is_patina_catalog: boolean
          notes: string | null
          payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          po_document_path: string | null
          po_number: string | null
          project_id: string
          sent_at: string | null
          ship_to: string | null
          sidemark: string | null
          status: string
          total_cents: number
          updated_at: string
          vendor_id: string
          vendor_po_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_direction_from_discovery: {
        Args: { p_designer_client_id: string }
        Returns: string
      }
      calculate_engagement_score: {
        Args: { p_user_id: string }
        Returns: number
      }
      cancel_agent_task: {
        Args: { p_actor: string; p_id: string; p_reason?: string }
        Returns: {
          artifacts: Json
          assignee: string | null
          attempts: number
          awaiting_review_at: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          flagged_stale_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_task_id: string | null
          payload: Json
          priority: number
          review_state: Json | null
          run_after: string
          source: string
          started_at: string | null
          status: string
          summary: string
          task_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ceremony_complete: {
        Args: {
          p_credential_line?: string
          p_intro: string
          p_lead_id: string
          p_portfolio_url?: string
          p_slots: Json
          p_timezone: string
        }
        Returns: Json
      }
      chase_invoice: { Args: { p_invoice_id: string }; Returns: string }
      check_concierge_payment_discrepancies: { Args: never; Returns: Json }
      claim_aesthete_jobs: {
        Args: { p_batch: number; p_kind: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          completed_at: string | null
          created_at: string | null
          dedupe_key: string | null
          id: number
          kind: string
          last_error: string | null
          payload: Json | null
          product_id: string | null
          run_after: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "aesthete_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_agent_tasks: {
        Args: {
          p_batch: number
          p_task_types: string[]
          p_visibility_timeout?: string
          p_worker: string
        }
        Returns: {
          artifacts: Json
          assignee: string | null
          attempts: number
          awaiting_review_at: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          flagged_stale_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_task_id: string | null
          payload: Json
          priority: number
          review_state: Json | null
          run_after: string
          source: string
          started_at: string | null
          status: string
          summary: string
          task_type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_design_request: { Args: { p_lead_id: string }; Returns: Json }
      claim_quiz_session: { Args: { p_session_key: string }; Returns: Json }
      client_pick: {
        Args: { p_ceremony_id: string; p_slot_id: string }
        Returns: Json
      }
      clone_proposal: {
        Args: {
          p_mode?: string
          p_revision_summary?: string
          p_source_id: string
        }
        Returns: string
      }
      close_project: {
        Args: { p_closure?: Json; p_project_id: string; p_snapshot?: Json }
        Returns: {
          actual_cents: number | null
          brief_document_url: string | null
          budget_cents: number | null
          budget_max: number | null
          budget_min: number | null
          change_order_terms: Json | null
          client_id: string | null
          client_profile_id: string | null
          client_visibility_tier: string
          closure_checklist: Json | null
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
          portfolio_snapshot: Json | null
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
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commit_field_capture: {
        Args: {
          p_client_capture_id: string
          p_destination: string
          p_organization_id?: string
          p_payload: Json
          p_project_id?: string
          p_project_room_id?: string
          p_shelf?: string
        }
        Returns: Json
      }
      commit_schedule_edit: {
        Args: { p_edits: Json; p_project_id: string; p_reason?: string }
        Returns: number
      }
      comms_resolve_role: { Args: { p_user_id: string }; Returns: string }
      complete_aesthete_job: {
        Args: { p_error?: string; p_id: number; p_status: string }
        Returns: undefined
      }
      complete_agent_task: {
        Args: {
          p_actor?: string
          p_artifacts?: Json
          p_confidence?: number
          p_error?: string
          p_fatal?: boolean
          p_id: string
          p_outcome: string
        }
        Returns: undefined
      }
      compute_house_taste_draft: { Args: never; Returns: string }
      concierge_checklist_template: { Args: { p_stage: string }; Returns: Json }
      concierge_damage_photo_checklist: { Args: never; Returns: Json }
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
      continue_board_in_project: {
        Args: { p_project_board_id: string }
        Returns: string
      }
      copy_schedule_as_built: {
        Args: {
          p_source_project_id: string
          p_target_project_id?: string
          p_target_proposal_id?: string
        }
        Returns: string[]
      }
      create_direct_order: {
        Args: { p_product_id: string; p_quantity?: number }
        Returns: {
          amount_cents: number
          client_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          product_id: string
          product_name: string
          quantity: number
          shipping: Json | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          unit_price_cents: number
        }
        SetofOptions: {
          from: "*"
          to: "direct_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_document_share: {
        Args: {
          p_expires_at?: string
          p_label?: string
          p_proposal_id: string
          p_visibility?: Json
        }
        Returns: {
          id: string
          token: string
        }[]
      }
      create_field_link: {
        Args: { p_party_id: string }
        Returns: {
          id: string
          token: string
        }[]
      }
      create_purchase_order: {
        Args: {
          p_confirmed_eta?: string
          p_custom_milestones?: Json
          p_deposit_amount_cents?: number
          p_deposit_due_date?: string
          p_ffe_item_ids: string[]
          p_is_patina_catalog?: boolean
          p_notes?: string
          p_payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          p_project_id: string
          p_sidemark?: string
          p_vendor_id: string
          p_vendor_po_number?: string
        }
        Returns: {
          acknowledged_at: string | null
          confirmed_eta: string | null
          created_at: string
          delivered_date: string | null
          designer_id: string
          id: string
          is_patina_catalog: boolean
          notes: string | null
          payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          po_document_path: string | null
          po_number: string | null
          project_id: string
          sent_at: string | null
          ship_to: string | null
          sidemark: string | null
          status: string
          total_cents: number
          updated_at: string
          vendor_id: string
          vendor_po_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_studio_workspace: {
        Args: { p_name: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cut_schedule_revision: {
        Args: { p_project_id: string; p_reason?: string }
        Returns: number
      }
      decline_workspace_invitation: {
        Args: { p_token: string }
        Returns: undefined
      }
      decrement_room_saved_items: {
        Args: { p_count?: number; p_room_id: string }
        Returns: undefined
      }
      demote_to_personal: { Args: { p_product_id: string }; Returns: string }
      derive_signature_biases: {
        Args: { p_designer_id: string }
        Returns: Json
      }
      dismiss_field_capture: { Args: { p_capture_id: string }; Returns: Json }
      draft_invoice_from_milestone: {
        Args: { p_milestone_id: string }
        Returns: string
      }
      enqueue_agent_task: {
        Args: {
          p_actor?: string
          p_artifacts?: Json
          p_assignee?: string
          p_confidence?: number
          p_entity_id?: string
          p_entity_type?: string
          p_idempotency_key?: string
          p_max_attempts?: number
          p_on_conflict?: string
          p_parent_task_id?: string
          p_payload?: Json
          p_priority?: number
          p_run_after?: string
          p_source?: string
          p_status?: string
          p_summary?: string
          p_task_type: string
        }
        Returns: {
          artifacts: Json
          assignee: string | null
          attempts: number
          awaiting_review_at: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          flagged_stale_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_task_id: string | null
          payload: Json
          priority: number
          review_state: Json | null
          run_after: string
          source: string
          started_at: string | null
          status: string
          summary: string
          task_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enroll_designer_onboarding: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      enter_concierge_damage_mode: {
        Args: {
          p_actor: string
          p_carrier_deadline?: string
          p_damage_claim_id?: string
          p_id: string
          p_note?: string
        }
        Returns: Json
      }
      escalate_item_feedback_to_decision: {
        Args: { p_decision_id: string; p_feedback_id: string }
        Returns: {
          board_item_id: string | null
          body: string | null
          client_id: string
          created_at: string
          decision_id: string | null
          ffe_item_id: string | null
          id: string
          proposal_item_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
          verdict: string
        }
        SetofOptions: {
          from: "*"
          to: "item_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      evaluate_collection_rules: {
        Args: { p_collection_id: string }
        Returns: Json
      }
      expire_room_scan_associations: { Args: never; Returns: number }
      export_designer_taste: { Args: { p_designer_id: string }; Returns: Json }
      ffe_status_rank: { Args: { p_status: string }; Returns: number }
      field_capture_jsonb_text_array: {
        Args: { p_value: Json }
        Returns: string[]
      }
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
      find_taught_alternatives: {
        Args: { p_match_count?: number; p_product_id: string }
        Returns: {
          brand: string
          category: string
          id: string
          images: string[]
          layer: string
          materials: string[]
          name: string
          price_retail: number
          similarity: number
          source_url: string
          style_tags: string[]
        }[]
      }
      flip_pending_balance_to_due: {
        Args: { p_purchase_order_id: string }
        Returns: undefined
      }
      generate_milestone_invoice: {
        Args: { p_milestone_id: string }
        Returns: string
      }
      generate_unique_org_slug: { Args: { p_name: string }; Returns: string }
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
      get_aesthete_matches: {
        Args: {
          p_category?: string
          p_designer_id?: string
          p_explore_ratio?: number
          p_layer?: string
          p_limit?: number
          p_offset?: number
          p_room_id?: string
          p_session_key: string
          p_w?: number
          p_weights_profile?: string
        }
        Returns: {
          confidence: number
          is_exploration: boolean
          product_id: string
          rank: number
          score: number
          why: Json
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
      get_designer_reliability_inputs: {
        Args: { p_designer_id: string }
        Returns: Json
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
      get_ffe_invoice_coverage: {
        Args: { p_project_id: string }
        Returns: {
          billed_cents: number
          coverage: string
          ffe_item_id: string
          invoice_id: string
          invoice_number: string
          invoice_status: string
        }[]
      }
      get_marketplace_vitals: {
        Args: never
        Returns: {
          active: boolean
          band: string
          computed_at: string
          display_order: number
          label: string
          metric_key: string
          prev_value: number
          unit: string
          value: number
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
      get_taste_refit_designers: {
        Args: never
        Returns: {
          designer_id: string
          drift_flag: boolean
          last_processed_at: string
          n_unprocessed: number
        }[]
      }
      get_taste_refit_payload: {
        Args: { p_designer_id: string }
        Returns: Json
      }
      get_user_permissions: { Args: { p_user_id: string }; Returns: string[] }
      grant_role_to_user: {
        Args: { p_granted_by?: string; p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      groom_agent_tasks: {
        Args: {
          p_failed_cooldown?: string
          p_stale_review?: string
          p_stale_running?: string
        }
        Returns: Json
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
      is_active_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_aesthete_lead: { Args: { p_user_id: string }; Returns: boolean }
      is_comms_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_comms_thread_participant: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      is_coordination_party: {
        Args: { _project_id: string; _user_id?: string }
        Returns: boolean
      }
      is_org_admin_or_owner: {
        Args: { _organization_id: string; _user_id?: string }
        Returns: boolean
      }
      is_org_owner: {
        Args: { _organization_id: string; _user_id?: string }
        Returns: boolean
      }
      is_product_in_active_use: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      is_project_team_member: {
        Args: { _project_id: string; _user_id?: string }
        Returns: boolean
      }
      is_studio_comember: { Args: { p_owner: string }; Returns: boolean }
      issue_invoice: {
        Args: { p_due_date?: string; p_invoice_id: string }
        Returns: {
          amount_paid_cents: number
          ar_flagged_at: string | null
          ar_last_chased_at: string | null
          client_id: string | null
          created_at: string
          currency: string
          designer_id: string
          due_date: string | null
          id: string
          internal_notes: string | null
          invoice_number: string | null
          issue_date: string | null
          last_reminder_at: string | null
          memo: string | null
          paid_at: string | null
          payment_terms_days: number
          project_id: string
          reminder_count: number
          sent_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          studio_id: string | null
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      item_feedback_gate: {
        Args: {
          p_board_item_id: string
          p_ffe_item_id: string
          p_proposal_item_id: string
        }
        Returns: {
          client_id: string
          designer_id: string
          feedback_enabled: boolean
          proposal_id: string
          status: string
        }[]
      }
      link_studio_to_catalog_for_vendor: {
        Args: { p_vendor_id: string }
        Returns: number
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
      log_po_acknowledgment: {
        Args: {
          p_confirmed_eta?: string
          p_po_id: string
          p_vendor_po_number?: string
        }
        Returns: {
          acknowledged_at: string | null
          confirmed_eta: string | null
          created_at: string
          delivered_date: string | null
          designer_id: string
          id: string
          is_patina_catalog: boolean
          notes: string | null
          payment_pattern: Database["public"]["Enums"]["purchase_order_payment_pattern"]
          po_document_path: string | null
          po_number: string | null
          project_id: string
          sent_at: string | null
          ship_to: string | null
          sidemark: string | null
          status: string
          total_cents: number
          updated_at: string
          vendor_id: string
          vendor_po_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_capture_upload_complete: {
        Args: { p_capture_id: string }
        Returns: undefined
      }
      mark_feedback_seen: { Args: { p_id: string }; Returns: undefined }
      mark_scan_upload_complete: {
        Args: { p_scan_id: string }
        Returns: undefined
      }
      match_designers_for_client: {
        Args: { p_session_key: string }
        Returns: {
          confidence: Json
          designer_id: string
          similarity: number
        }[]
      }
      may_resolve_coordination_item: {
        Args: {
          actor: string
          item: Database["public"]["Tables"]["client_decisions"]["Row"]
        }
        Returns: boolean
      }
      merge_capture_artifact_sha256: {
        Args: { p_capture_id: string; p_kind: string; p_sha: string }
        Returns: undefined
      }
      merge_scan_artifact_sha256: {
        Args: { p_kind: string; p_scan_id: string; p_sha: string }
        Returns: undefined
      }
      migrate_legacy_ffe_notes: { Args: never; Returns: number }
      move_pipeline_stage: {
        Args: {
          p_actor: string
          p_entity_id: string
          p_entity_type: string
          p_note?: string
          p_to_stage: string
        }
        Returns: Json
      }
      next_co_number: { Args: { p_project_id: string }; Returns: string }
      next_court_for: {
        Args: { item: Database["public"]["Tables"]["client_decisions"]["Row"] }
        Returns: string
      }
      nomination_transition_is_legal: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      normalize_phone_e164: { Args: { p_phone: string }; Returns: string }
      notify_decision_overdue: {
        Args: { p_decision_id: string }
        Returns: string
      }
      notify_decision_required: {
        Args: { p_decision_id: string }
        Returns: string
      }
      notify_decision_resolved: {
        Args: { p_decision_id: string }
        Returns: string
      }
      notify_decision_updated: {
        Args: { p_decision_id: string }
        Returns: string
      }
      notify_item_feedback: { Args: { p_feedback_id: string }; Returns: string }
      nudge_proposal: { Args: { p_proposal_id: string }; Returns: string }
      open_project_direct: {
        Args: {
          p_budget_max_cents?: number
          p_budget_min_cents?: number
          p_client_id?: string
          p_id?: string
          p_start_date?: string
          p_title: string
        }
        Returns: string
      }
      po_status_to_ffe_stage: { Args: { p_po_status: string }; Returns: string }
      preview_taste_update: { Args: { p_judgment_id: number }; Returns: Json }
      process_style_quiz: {
        Args: { quiz_answers: Json; timings?: Json }
        Returns: Json
      }
      promote_batch_to_studio: { Args: { p_items: Json }; Returns: string[] }
      promote_to_studio: {
        Args: {
          p_category: string
          p_lead_time_weeks: number
          p_payment_terms: string
          p_product_id: string
          p_studio_id: string
          p_subcategory?: string
          p_usage_notes: string
          p_vendor_contact: Json
        }
        Returns: string
      }
      react_to_feedback: {
        Args: { p_emoji: string; p_id: string }
        Returns: {
          actor: string
          created_at: string
          feedback_id: string
          id: string
          kind: string
          payload: Json
        }
        SetofOptions: {
          from: "*"
          to: "feedback_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      realtime_project_access: { Args: { topic: string }; Returns: boolean }
      recompute_portfolio_centroid: {
        Args: { p_designer_id: string }
        Returns: Json
      }
      record_activation_event: {
        Args: { p_event_name: string; p_properties?: Json; p_user_id: string }
        Returns: undefined
      }
      record_invoice_payment: {
        Args: {
          p_amount_cents: number
          p_invoice_id: string
          p_method: string
          p_note?: string
          p_received_at?: string
          p_reference?: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          id: string
          invoice_id: string
          method: string
          note: string | null
          received_at: string | null
          recorded_by: string | null
          reference: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_offline_signature: {
        Args: {
          p_auto_activate?: boolean
          p_proposal_id: string
          p_signed_name: string
          p_start_date?: string
        }
        Returns: string
      }
      refresh_designer_teaching_stats: { Args: never; Returns: number }
      refresh_marketplace_vitals: { Args: never; Returns: Json }
      refresh_offered_slots: {
        Args: { p_ceremony_id: string; p_slots: Json }
        Returns: Json
      }
      refresh_product_behavior_stats: { Args: never; Returns: undefined }
      refresh_style_centroids: { Args: never; Returns: number }
      reopen_item_feedback: {
        Args: { p_feedback_id: string }
        Returns: {
          board_item_id: string | null
          body: string | null
          client_id: string
          created_at: string
          decision_id: string | null
          ffe_item_id: string | null
          id: string
          proposal_item_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
          verdict: string
        }
        SetofOptions: {
          from: "*"
          to: "item_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_proposal_items: {
        Args: { p_ordered_ids: string[]; p_proposal_id: string }
        Returns: undefined
      }
      reorder_proposal_scope_rooms: {
        Args: { p_ordered_ids: string[]; p_proposal_id: string }
        Returns: undefined
      }
      reply_to_feedback: {
        Args: { p_id: string; p_text: string }
        Returns: {
          actor: string
          created_at: string
          feedback_id: string
          id: string
          kind: string
          payload: Json
        }
        SetofOptions: {
          from: "*"
          to: "feedback_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reply_to_item_feedback: {
        Args: { p_body: string; p_feedback_id: string }
        Returns: {
          actor: string
          body: string | null
          created_at: string
          feedback_id: string
          id: string
          kind: string
        }
        SetofOptions: {
          from: "*"
          to: "item_feedback_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_proposal_change: {
        Args: { p_feedback: string; p_proposal_id: string }
        Returns: undefined
      }
      requeue_agent_task: {
        Args: { p_actor: string; p_feedback?: string; p_id: string }
        Returns: {
          artifacts: Json
          assignee: string | null
          attempts: number
          awaiting_review_at: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          flagged_stale_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_task_id: string | null
          payload: Json
          priority: number
          review_state: Json | null
          run_after: string
          source: string
          started_at: string | null
          status: string
          summary: string
          task_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_coordination_item: {
        Args: {
          p_answer?: string
          p_item_id: string
          p_next_court?: string
          p_resolved_by?: string
          p_revision_id?: string
          p_selected_option_id?: string
        }
        Returns: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          blocking_status: string
          blocks_kind: string
          blocks_milestone_id: string | null
          client_consent_method: string | null
          client_consented_at: string | null
          client_signature: string | null
          context: string | null
          coordination_kind: string
          court: string
          court_party_id: string | null
          created_at: string
          decision_kind: string
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
          room_id: string | null
          section_key: string | null
          selected_by: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
          viewed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "client_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_document_share: {
        Args: { p_token: string }
        Returns: {
          label: string
          proposal_id: string
          studio_name: string
          visibility: Json
        }[]
      }
      resolve_field_link: { Args: { p_token: string }; Returns: Json }
      resolve_item_feedback: {
        Args: { p_feedback_id: string }
        Returns: {
          board_item_id: string | null
          body: string | null
          client_id: string
          created_at: string
          decision_id: string | null
          ffe_item_id: string | null
          id: string
          proposal_item_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
          verdict: string
        }
        SetofOptions: {
          from: "*"
          to: "item_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_studio_identity: {
        Args: { p_designer_id?: string; p_project_id?: string }
        Returns: {
          logo_url: string
          name: string
          source: string
          studio_id: string
          website: string
        }[]
      }
      retire_designer_taste: {
        Args: { p_designer_id: string }
        Returns: undefined
      }
      review_agent_task: {
        Args: {
          p_decision: string
          p_id: string
          p_note?: string
          p_payload_patch?: Json
          p_review_meta?: Json
          p_reviewer: string
        }
        Returns: {
          artifacts: Json
          assignee: string | null
          attempts: number
          awaiting_review_at: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          flagged_stale_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          parent_task_id: string | null
          payload: Json
          priority: number
          review_state: Json | null
          run_after: string
          source: string
          started_at: string | null
          status: string
          summary: string
          task_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_sms_message: {
        Args: { p_action: string; p_effect?: Json; p_message_id: string }
        Returns: Json
      }
      revoke_document_share: { Args: { p_share_id: string }; Returns: boolean }
      revoke_field_link: { Args: { p_token_id: string }; Returns: boolean }
      revoke_role_from_user: {
        Args: { p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      revoke_room_scan_access: {
        Args: { p_association_id: string; p_reason?: string }
        Returns: boolean
      }
      route_field_capture: {
        Args: {
          p_capture_id: string
          p_project_id?: string
          p_project_room_id?: string
          p_shelf?: string
        }
        Returns: Json
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
      run_aesthete_drift_audit: {
        Args: { p_now?: string }
        Returns: {
          check_name: string
          detail: Json
          passed: boolean
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
      seed_house_from_validated_catalog: { Args: never; Returns: string }
      seed_project_schedule_from_template: {
        Args: { p_project_id: string; p_template_slug: string }
        Returns: string[]
      }
      send_proposal: {
        Args: {
          p_cc_email?: string
          p_personal_message?: string
          p_proposal_id: string
          p_valid_until?: string
        }
        Returns: {
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
          designer_client_id: string | null
          designer_id: string
          discount_amount: number | null
          discount_percent: number | null
          feedback_enabled: boolean
          id: string
          last_nudged_at: string | null
          nudge_count: number
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
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_weekly_pulse: {
        Args: { p_body: string; p_pulse_id: string; p_subject?: string }
        Returns: {
          anchor_id: string | null
          anchor_kind: string
          body: string | null
          created_at: string
          designer_id: string
          id: string
          project_id: string
          sent_at: string | null
          sent_message_id: string | null
          status: string
          subject: string | null
          updated_at: string
          week_of: string
        }
        SetofOptions: {
          from: "*"
          to: "weekly_pulses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_document_client: {
        Args: {
          p_client_id: string
          p_engagement_kind: string
          p_target_id: string
        }
        Returns: undefined
      }
      set_feedback_status: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: {
          app_version: string | null
          bucket: string
          created_at: string
          created_by: string
          element: string | null
          id: string
          note: string | null
          resolution: string | null
          route: string | null
          screen_name: string | null
          screenshot_path: string | null
          shipped_seen_at: string | null
          status: string
          updated_at: string
          viewport: string | null
          weight: string | null
        }
        SetofOptions: {
          from: "*"
          to: "feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_nomination_status: {
        Args: {
          p_decline_reason?: string
          p_nomination_id: string
          p_patina_outreach_summary?: string
          p_to_status: string
        }
        Returns: string
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
      sign_proposal: {
        Args: {
          p_auto_activate?: boolean
          p_proposal_id: string
          p_signed_ip?: string
          p_signed_name: string
          p_start_date?: string
        }
        Returns: {
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
          designer_client_id: string | null
          designer_id: string
          discount_amount: number | null
          discount_percent: number | null
          feedback_enabled: boolean
          id: string
          last_nudged_at: string | null
          nudge_count: number
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
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_coordination_revision: {
        Args: {
          p_attachments?: Json
          p_item_id: string
          p_note?: string
          p_status?: string
          p_submitted_by?: string
        }
        Returns: {
          attachments: Json
          created_at: string
          decision_id: string
          id: string
          note: string | null
          rev_number: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "coordination_item_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_design_request: {
        Args: {
          p_budget_range?: string
          p_client_request_id?: string
          p_description?: string
          p_designer_id?: string
          p_primary_scan_id?: string
          p_project_type: string
          p_scan_ids: string[]
          p_source?: string
          p_timeline?: string
        }
        Returns: Json
      }
      submit_style_quiz: {
        Args: {
          p_answers: Json
          p_attribution?: Json
          p_session_key: string
          p_source?: string
          p_timings?: Json
        }
        Returns: Json
      }
      submit_taste_correction: {
        Args: {
          p_client_profile_id?: string
          p_direction?: Json
          p_free_text?: string
          p_product_id?: string
          p_replacement_product_id?: string
          p_subject: string
          p_surface?: string
        }
        Returns: Json
      }
      submit_taste_judgment: {
        Args: {
          p_choice: string
          p_client_profile_id?: string
          p_context?: string
          p_latency_ms?: number
          p_pair: Json
        }
        Returns: Json
      }
      swap_line_to_product: {
        Args: {
          p_feedback_id: string
          p_product_id: string
          p_proposal_item_id: string
          p_rank?: number
        }
        Returns: {
          budget_max_cents: number | null
          budget_min_cents: number | null
          category: string | null
          created_at: string
          custom_fields: Json
          description: string | null
          doc_code: string | null
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
        SetofOptions: {
          from: "*"
          to: "proposal_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      toggle_concierge_checklist_item: {
        Args: {
          p_actor: string
          p_done: boolean
          p_id: string
          p_key: string
          p_stage: string
        }
        Returns: Json
      }
      transfer_studio_ownership: {
        Args: { p_new_owner: string; p_org_id: string }
        Returns: undefined
      }
      update_my_biases: { Args: { p_overrides: Json }; Returns: Json }
      user_has_role: {
        Args: { p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      user_has_role_domain: {
        Args: { p_domain: string; p_user_id: string }
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
      vec_lerp: { Args: { a: string; b: string; w: number }; Returns: string }
      vec_normalize: { Args: { v: string }; Returns: string }
      vec_scale: { Args: { k: number; v: string }; Returns: string }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: {
          amount_paid_cents: number
          ar_flagged_at: string | null
          ar_last_chased_at: string | null
          client_id: string | null
          created_at: string
          currency: string
          designer_id: string
          due_date: string | null
          id: string
          internal_notes: string | null
          invoice_number: string | null
          issue_date: string | null
          last_reminder_at: string | null
          memo: string | null
          paid_at: string | null
          payment_terms_days: number
          project_id: string
          reminder_count: number
          sent_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          studio_id: string | null
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
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
        | "pending"
        | "waitlisted"
        | "onboarding"
        | "active"
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
      decision_notification_kind:
        | "decision_required"
        | "decision_overdue"
        | "decision_resolved"
        | "decision_updated"
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
      po_payment_state: "pending" | "due" | "paid" | "refunded"
      procurement_notification_kind:
        | "deposit_due"
        | "balance_due"
        | "milestone_due"
        | "delivery_this_week"
        | "damage_claim_drafted"
        | "payment_received"
        | "payment_failed"
        | "payment_refunded"
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
        "pending",
        "waitlisted",
        "onboarding",
        "active",
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
      decision_notification_kind: [
        "decision_required",
        "decision_overdue",
        "decision_resolved",
        "decision_updated",
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
      po_payment_state: ["pending", "due", "paid", "refunded"],
      procurement_notification_kind: [
        "deposit_due",
        "balance_due",
        "milestone_due",
        "delivery_this_week",
        "damage_claim_drafted",
        "payment_received",
        "payment_failed",
        "payment_refunded",
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

