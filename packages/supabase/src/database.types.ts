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
      account_deletion_requests: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          deleted_data: Json | null
          id: string
          processing_started_at: string | null
          reason: string | null
          requested_at: string
          scheduled_for: string
          status: Database["public"]["Enums"]["account_deletion_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_data?: Json | null
          id?: string
          processing_started_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for: string
          status?: Database["public"]["Enums"]["account_deletion_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_data?: Json | null
          id?: string
          processing_started_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["account_deletion_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      client_messages: {
        Row: {
          archived_by_recipient: boolean | null
          archived_by_sender: boolean | null
          attachments: Json | null
          body: string
          created_at: string
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
      collection_products: {
        Row: {
          added_at: string | null
          collection_id: string
          id: string
          position: number | null
          product_id: string
        }
        Insert: {
          added_at?: string | null
          collection_id: string
          id?: string
          position?: number | null
          product_id: string
        }
        Update: {
          added_at?: string | null
          collection_id?: string
          id?: string
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
        ]
      }
      collections: {
        Row: {
          cover_image: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          cover_image?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          cover_image?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
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
      data_export_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          download_url: string | null
          error: string | null
          expires_at: string | null
          file_size_bytes: number | null
          id: string
          included_data: string[]
          processing_started_at: string | null
          requested_at: string
          retry_count: number
          status: Database["public"]["Enums"]["data_export_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          download_url?: string | null
          error?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          included_data?: string[]
          processing_started_at?: string | null
          requested_at?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["data_export_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          download_url?: string | null
          error?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          included_data?: string[]
          processing_started_at?: string | null
          requested_at?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["data_export_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          last_project_at: string | null
          lead_id: string | null
          nickname: string | null
          notes: string | null
          source: string | null
          status: string
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
          last_project_at?: string | null
          lead_id?: string | null
          nickname?: string | null
          notes?: string | null
          source?: string | null
          status?: string
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
          last_project_at?: string | null
          lead_id?: string | null
          nickname?: string | null
          notes?: string | null
          source?: string | null
          status?: string
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
      email_templates: {
        Row: {
          category: Database["public"]["Enums"]["email_template_category"]
          content_blocks: Json
          created_at: string
          created_by: string | null
          description: string | null
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
        ]
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
            foreignKeyName: "product_relations_product_b_id_fkey"
            columns: ["product_b_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
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
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available_colors: string[] | null
          brand: string | null
          captured_at: string
          captured_by: string | null
          category: string | null
          colors: string[] | null
          created_at: string | null
          description: string | null
          dimensions: Json | null
          embedding: string | null
          embedding_updated_at: string | null
          finish: string | null
          id: string
          images: string[] | null
          materials: string[] | null
          name: string
          price_retail: number | null
          price_trade: number | null
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
          status: string | null
          style_tags: string[] | null
          tags: string[] | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          available_colors?: string[] | null
          brand?: string | null
          captured_at: string
          captured_by?: string | null
          category?: string | null
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          embedding?: string | null
          embedding_updated_at?: string | null
          finish?: string | null
          id?: string
          images?: string[] | null
          materials?: string[] | null
          name: string
          price_retail?: number | null
          price_trade?: number | null
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
          status?: string | null
          style_tags?: string[] | null
          tags?: string[] | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          available_colors?: string[] | null
          brand?: string | null
          captured_at?: string
          captured_by?: string | null
          category?: string | null
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          embedding?: string | null
          embedding_updated_at?: string | null
          finish?: string | null
          id?: string
          images?: string[] | null
          materials?: string[] | null
          name?: string
          price_retail?: number | null
          price_trade?: number | null
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
          status?: string | null
          style_tags?: string[] | null
          tags?: string[] | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "vendors"
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
          id: string
          ios_device_id: string | null
          is_designer: boolean | null
          is_verified: boolean | null
          last_active_at: string | null
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
          id: string
          ios_device_id?: string | null
          is_designer?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
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
          id?: string
          ios_device_id?: string | null
          is_designer?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
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
      projects: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          client_profile_id: string | null
          created_at: string | null
          created_by: string
          id: string
          name: string
          notes: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          timeline_end: string | null
          timeline_start: string | null
          updated_at: string | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          client_profile_id?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          name: string
          notes?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          timeline_end?: string | null
          timeline_start?: string | null
          updated_at?: string | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          client_profile_id?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          name?: string
          notes?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          timeline_end?: string | null
          timeline_start?: string | null
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
        ]
      }
      proposal_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          internal_notes: string | null
          lead_time_weeks: number | null
          line_total: number
          markup_percent: number | null
          name: string
          notes: string | null
          position: number
          product_id: string | null
          proposal_id: string
          quantity: number
          room: string | null
          unit_price: number
          unit_sell_price: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          internal_notes?: string | null
          lead_time_weeks?: number | null
          line_total: number
          markup_percent?: number | null
          name: string
          notes?: string | null
          position?: number
          product_id?: string | null
          proposal_id: string
          quantity?: number
          room?: string | null
          unit_price: number
          unit_sell_price: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          internal_notes?: string | null
          lead_time_weeks?: number | null
          line_total?: number
          markup_percent?: number | null
          name?: string
          notes?: string | null
          position?: number
          product_id?: string | null
          proposal_id?: string
          quantity?: number
          room?: string | null
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
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
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
      proposals: {
        Row: {
          accepted_at: string | null
          client_id: string | null
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
          project_id: string | null
          sent_at: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          title: string
          total_amount: number | null
          updated_at: string
          valid_until: string | null
          version: number | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
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
          project_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          title: string
          total_amount?: number | null
          updated_at?: string
          valid_until?: string | null
          version?: number | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
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
          project_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
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
        ]
      }
      room_scan_images: {
        Row: {
          brightness_score: number | null
          captured_at: string
          composition_score: number | null
          created_at: string
          device_orientation: string | null
          display_order: number
          feature_category: string | null
          feature_confidence: number | null
          file_size_bytes: number | null
          height: number | null
          id: string
          image_url: string
          is_primary: boolean
          light_estimate: number | null
          mime_type: string | null
          quality_score: number | null
          role: string
          room_id: string | null
          scan_id: string
          sharpness_score: number | null
          stability_score: number | null
          thumbnail_url: string | null
          width: number | null
        }
        Insert: {
          brightness_score?: number | null
          captured_at: string
          composition_score?: number | null
          created_at?: string
          device_orientation?: string | null
          display_order?: number
          feature_category?: string | null
          feature_confidence?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          image_url: string
          is_primary?: boolean
          light_estimate?: number | null
          mime_type?: string | null
          quality_score?: number | null
          role: string
          room_id?: string | null
          scan_id: string
          sharpness_score?: number | null
          stability_score?: number | null
          thumbnail_url?: string | null
          width?: number | null
        }
        Update: {
          brightness_score?: number | null
          captured_at?: string
          composition_score?: number | null
          created_at?: string
          device_orientation?: string | null
          display_order?: number
          feature_category?: string | null
          feature_confidence?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          image_url?: string
          is_primary?: boolean
          light_estimate?: number | null
          mime_type?: string | null
          quality_score?: number | null
          role?: string
          room_id?: string | null
          scan_id?: string
          sharpness_score?: number | null
          stability_score?: number | null
          thumbnail_url?: string | null
          width?: number | null
        }
        Relationships: [
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
        ]
      }
      room_scans: {
        Row: {
          annotations: Json | null
          average_image_quality: number | null
          coverage_percentage: number | null
          created_at: string
          dimensions: Json | null
          features: Json | null
          floor_area: number | null
          furniture_detected: Json | null
          hero_frame_candidate_count: number | null
          hero_frame_captured_at: string | null
          hero_frame_score: number | null
          hero_frame_url: string | null
          id: string
          image_count: number | null
          measurements: Json | null
          model_url: string | null
          model_url_gltf: string | null
          name: string
          processed_at: string | null
          project_id: string | null
          quality_grade: string | null
          room_id: string | null
          room_type: string | null
          scan_data: Json | null
          scanned_at: string
          status: string
          style_signals: Json | null
          suggested_styles: string[] | null
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          annotations?: Json | null
          average_image_quality?: number | null
          coverage_percentage?: number | null
          created_at?: string
          dimensions?: Json | null
          features?: Json | null
          floor_area?: number | null
          furniture_detected?: Json | null
          hero_frame_candidate_count?: number | null
          hero_frame_captured_at?: string | null
          hero_frame_score?: number | null
          hero_frame_url?: string | null
          id?: string
          image_count?: number | null
          measurements?: Json | null
          model_url?: string | null
          model_url_gltf?: string | null
          name: string
          processed_at?: string | null
          project_id?: string | null
          quality_grade?: string | null
          room_id?: string | null
          room_type?: string | null
          scan_data?: Json | null
          scanned_at?: string
          status?: string
          style_signals?: Json | null
          suggested_styles?: string[] | null
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          annotations?: Json | null
          average_image_quality?: number | null
          coverage_percentage?: number | null
          created_at?: string
          dimensions?: Json | null
          features?: Json | null
          floor_area?: number | null
          furniture_detected?: Json | null
          hero_frame_candidate_count?: number | null
          hero_frame_captured_at?: string | null
          hero_frame_score?: number | null
          hero_frame_url?: string | null
          id?: string
          image_count?: number | null
          measurements?: Json | null
          model_url?: string | null
          model_url_gltf?: string | null
          name?: string
          processed_at?: string | null
          project_id?: string | null
          quality_grade?: string | null
          room_id?: string | null
          room_type?: string | null
          scan_data?: Json | null
          scanned_at?: string
          status?: string
          style_signals?: Json | null
          suggested_styles?: string[] | null
          thumbnail_url?: string | null
          user_id?: string
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
          designer_rating_avg: number | null
          founded_year: number | null
          headquarters_city: string | null
          headquarters_state: string | null
          hero_image_url: string | null
          id: string
          lead_times: Json | null
          logo_url: string | null
          made_in: string | null
          market_position: Database["public"]["Enums"]["market_position"] | null
          name: string
          notes: string | null
          ownership: Database["public"]["Enums"]["ownership_type"] | null
          parent_company_id: string | null
          primary_category: string | null
          production_model:
            | Database["public"]["Enums"]["production_model"]
            | null
          review_count: number | null
          secondary_categories: string[] | null
          social_links: Json | null
          trade_terms: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          brand_story?: Json | null
          contact_info?: Json | null
          created_at?: string | null
          designer_rating_avg?: number | null
          founded_year?: number | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          hero_image_url?: string | null
          id?: string
          lead_times?: Json | null
          logo_url?: string | null
          made_in?: string | null
          market_position?:
            | Database["public"]["Enums"]["market_position"]
            | null
          name: string
          notes?: string | null
          ownership?: Database["public"]["Enums"]["ownership_type"] | null
          parent_company_id?: string | null
          primary_category?: string | null
          production_model?:
            | Database["public"]["Enums"]["production_model"]
            | null
          review_count?: number | null
          secondary_categories?: string[] | null
          social_links?: Json | null
          trade_terms?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          brand_story?: Json | null
          contact_info?: Json | null
          created_at?: string | null
          designer_rating_avg?: number | null
          founded_year?: number | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          hero_image_url?: string | null
          id?: string
          lead_times?: Json | null
          logo_url?: string | null
          made_in?: string | null
          market_position?:
            | Database["public"]["Enums"]["market_position"]
            | null
          name?: string
          notes?: string | null
          ownership?: Database["public"]["Enums"]["ownership_type"] | null
          parent_company_id?: string | null
          primary_category?: string | null
          production_model?:
            | Database["public"]["Enums"]["production_model"]
            | null
          review_count?: number | null
          secondary_categories?: string[] | null
          social_links?: Json | null
          trade_terms?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
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
          auth_user_id: string | null
          converted_at: string | null
          created_at: string
          cta_text: string | null
          email: string
          first_touch_attribution: Json | null
          id: string
          ip_address: unknown
          last_touch_attribution: Json | null
          posthog_distinct_id: string | null
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
          auth_user_id?: string | null
          converted_at?: string | null
          created_at?: string
          cta_text?: string | null
          email: string
          first_touch_attribution?: Json | null
          id?: string
          ip_address?: unknown
          last_touch_attribution?: Json | null
          posthog_distinct_id?: string | null
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
          auth_user_id?: string | null
          converted_at?: string | null
          created_at?: string
          cta_text?: string | null
          email?: string
          first_touch_attribution?: Json | null
          id?: string
          ip_address?: unknown
          last_touch_attribution?: Json | null
          posthog_distinct_id?: string | null
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
      designer_funnel: {
        Row: {
          count: number | null
          step: string | null
          step_order: number | null
        }
        Relationships: []
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
    }
    Functions: {
      aggregate_user_style_signals: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      calculate_engagement_score: {
        Args: { p_user_id: string }
        Returns: number
      }
      decrement_room_saved_items: {
        Args: { p_count?: number; p_room_id: string }
        Returns: undefined
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
      revoke_role_from_user: {
        Args: { p_role_name: string; p_user_id: string }
        Returns: boolean
      }
      revoke_room_scan_access: {
        Args: { p_association_id: string; p_reason?: string }
        Returns: boolean
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
      production_model: "stock" | "mto" | "custom" | "mixed"
      project_status: "active" | "completed" | "archived"
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
      production_model: ["stock", "mto", "custom", "mixed"],
      project_status: ["active", "completed", "archived"],
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

