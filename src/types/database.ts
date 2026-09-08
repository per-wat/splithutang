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
      expense_item_addons: {
        Row: {
          amount: number
          created_at: string
          expense_item_id: string
          id: string
          name: string
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_item_id: string
          id?: string
          name: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_item_id?: string
          id?: string
          name?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_item_addons_expense_item_id_fkey"
            columns: ["expense_item_id"]
            isOneToOne: false
            referencedRelation: "expense_items"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_item_participants: {
        Row: {
          created_at: string
          expense_item_id: string
          person_id: string
        }
        Insert: {
          created_at?: string
          expense_item_id: string
          person_id: string
        }
        Update: {
          created_at?: string
          expense_item_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_item_participants_expense_item_id_fkey"
            columns: ["expense_item_id"]
            isOneToOne: false
            referencedRelation: "expense_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_item_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_items: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          name: string
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_id: string
          id?: string
          name: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          name?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_participants: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          person_id: string
          share_amount: number
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          person_id: string
          share_amount: number
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          person_id?: string
          share_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_participants_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          from_person_id: string
          id: string
          note: string | null
          paid_at: string
          resolved_at: string | null
          resolved_by_user_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          submitted_by_user_id: string | null
          to_person_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_id: string
          from_person_id: string
          id?: string
          note?: string | null
          paid_at?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_by_user_id?: string | null
          to_person_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          from_person_id?: string
          id?: string
          note?: string | null
          paid_at?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_by_user_id?: string | null
          to_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_from_person_id_fkey"
            columns: ["from_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          created_at: string
          expense_date: string
          group_id: string
          id: string
          name: string
          owner_id: string
          paid_by: string
          receipt_rounding: number | null
          receipt_service_charge: number | null
          receipt_subtotal: number | null
          receipt_tax: number | null
          split_method: Database["public"]["Enums"]["split_method"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expense_date?: string
          group_id: string
          id?: string
          name: string
          owner_id: string
          paid_by: string
          receipt_rounding?: number | null
          receipt_service_charge?: number | null
          receipt_subtotal?: number | null
          receipt_tax?: number | null
          split_method: Database["public"]["Enums"]["split_method"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expense_date?: string
          group_id?: string
          id?: string
          name?: string
          owner_id?: string
          paid_by?: string
          receipt_rounding?: number | null
          receipt_service_charge?: number | null
          receipt_subtotal?: number | null
          receipt_tax?: number | null
          split_method?: Database["public"]["Enums"]["split_method"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          claimed_person_id: string | null
          created_at: string
          email: string
          expires_at: string
          group_id: string
          id: string
          invited_by: string
          person_id: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["group_invite_status"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          claimed_person_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          group_id: string
          id?: string
          invited_by: string
          person_id?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["group_invite_status"]
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          claimed_person_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          group_id?: string
          id?: string
          invited_by?: string
          person_id?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["group_invite_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_claimed_person_id_fkey"
            columns: ["claimed_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          ended_at: string | null
          ended_by_user_id: string | null
          group_id: string
          membership_status: Database["public"]["Enums"]["group_membership_status"]
          person_id: string
          role: Database["public"]["Enums"]["group_member_role"]
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ended_by_user_id?: string | null
          group_id: string
          membership_status?: Database["public"]["Enums"]["group_membership_status"]
          person_id: string
          role?: Database["public"]["Enums"]["group_member_role"]
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ended_by_user_id?: string | null
          group_id?: string
          membership_status?: Database["public"]["Enums"]["group_membership_status"]
          person_id?: string
          role?: Database["public"]["Enums"]["group_member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "group_members_ended_by_user_id_fkey"
            columns: ["ended_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          allow_debtor_self_confirm: boolean
          archived_at: string | null
          archived_by_user_id: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          allow_debtor_self_confirm?: boolean
          archived_at?: string | null
          archived_by_user_id?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          allow_debtor_self_confirm?: boolean
          archived_at?: string | null
          archived_by_user_id?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_archived_by_user_id_fkey"
            columns: ["archived_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iou_payments: {
        Row: {
          amount: number
          created_at: string
          from_person_id: string
          id: string
          iou_id: string
          note: string | null
          paid_at: string
          resolved_at: string | null
          resolved_by_user_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          submitted_by_user_id: string | null
          to_person_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_person_id: string
          id?: string
          iou_id: string
          note?: string | null
          paid_at?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_by_user_id?: string | null
          to_person_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_person_id?: string
          id?: string
          iou_id?: string
          note?: string | null
          paid_at?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_by_user_id?: string | null
          to_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iou_payments_from_person_id_fkey"
            columns: ["from_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iou_payments_iou_id_fkey"
            columns: ["iou_id"]
            isOneToOne: false
            referencedRelation: "ious"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iou_payments_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      ious: {
        Row: {
          amount: number
          created_at: string
          from_person_id: string
          group_id: string
          id: string
          iou_date: string
          owner_id: string
          reason: string
          to_person_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_person_id: string
          group_id: string
          id?: string
          iou_date?: string
          owner_id: string
          reason: string
          to_person_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_person_id?: string
          group_id?: string
          id?: string
          iou_date?: string
          owner_id?: string
          reason?: string
          to_person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ious_from_person_id_fkey"
            columns: ["from_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ious_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ious_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ious_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          push_mode: Database["public"]["Enums"]["notification_push_mode"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          push_mode?: Database["public"]["Enums"]["notification_push_mode"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          push_mode?: Database["public"]["Enums"]["notification_push_mode"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_push_outbox: {
        Row: {
          attempts: number
          created_at: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          notification_id: string
          processed_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          notification_id: string
          processed_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          notification_id?: string
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          body: string
          created_at: string
          deduplication_key: string | null
          group_id: string | null
          id: string
          metadata: Json
          notification_type: string
          read_at: string | null
          recipient_user_id: string
          resource_id: string | null
          resource_type: string
          title: string
        }
        Insert: {
          actor_user_id?: string | null
          body: string
          created_at?: string
          deduplication_key?: string | null
          group_id?: string | null
          id?: string
          metadata?: Json
          notification_type: string
          read_at?: string | null
          recipient_user_id: string
          resource_id?: string | null
          resource_type: string
          title: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string
          created_at?: string
          deduplication_key?: string | null
          group_id?: string | null
          id?: string
          metadata?: Json
          notification_type?: string
          read_at?: string | null
          recipient_user_id?: string
          resource_id?: string | null
          resource_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          avatar_color: string | null
          avatar_path: string | null
          created_at: string
          id: string
          linked_user_id: string | null
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          avatar_color?: string | null
          avatar_path?: string | null
          created_at?: string
          id?: string
          linked_user_id?: string | null
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          avatar_color?: string | null
          avatar_path?: string | null
          created_at?: string
          id?: string
          linked_user_id?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_color: string
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_color?: string
          avatar_path?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_color?: string
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_group_member: {
        Args: { p_group_id: string; p_person_id: string }
        Returns: undefined
      }
      archive_group: { Args: { p_group_id: string }; Returns: undefined }
      claim_group_invite: { Args: { p_token: string }; Returns: string }
      claim_notification_push_outbox: {
        Args: { p_limit?: number }
        Returns: {
          notification_id: string
        }[]
      }
      create_expense: {
        Args: {
          p_expense_date: string
          p_group_id: string
          p_items?: Json
          p_name: string
          p_paid_by: string
          p_participants: Json
          p_receipt_summary?: Json
          p_split_method: Database["public"]["Enums"]["split_method"]
          p_total_amount: number
        }
        Returns: string
      }
      create_group: {
        Args: {
          p_allow_debtor_self_confirm?: boolean
          p_member_ids?: string[]
          p_name: string
        }
        Returns: string
      }
      create_group_invite: {
        Args: { p_email: string; p_group_id: string; p_person_id: string }
        Returns: string
      }
      create_iou: {
        Args: {
          p_amount: number
          p_from_person_id: string
          p_group_id: string
          p_iou_date: string
          p_reason: string
          p_to_person_id: string
        }
        Returns: string
      }
      create_local_group_member: {
        Args: { p_avatar_color?: string; p_group_id: string; p_name: string }
        Returns: string
      }
      get_expenses_overview: {
        Args: never
        Returns: {
          created_at: string
          expense_date: string
          expense_id: string
          name: string
          paid_by_name: string
          status: string
          total_amount: number
          unpaid_count: number
        }[]
      }
      get_group_invite_preview: {
        Args: { p_token: string }
        Returns: {
          contact_name: string
          email_hint: string
          expires_at: string
          group_id: string
          group_name: string
          status: string
        }[]
      }
      get_group_invites: {
        Args: { p_group_id: string }
        Returns: {
          accepted_at: string
          claimed_person_id: string
          email: string
          expires_at: string
          invite_id: string
          person_id: string
          person_name: string
          status: string
          token: string
        }[]
      }
      get_group_member_candidates: {
        Args: never
        Returns: {
          avatar_color: string
          name: string
          person_id: string
        }[]
      }
      get_groups_overview: {
        Args: never
        Returns: {
          allow_debtor_self_confirm: boolean
          archived_at: string
          created_at: string
          group_id: string
          is_owner: boolean
          member_count: number
          name: string
        }[]
      }
      get_ious_overview: {
        Args: never
        Returns: {
          created_at: string
          from_name: string
          iou_date: string
          iou_id: string
          original_amount: number
          outstanding_amount: number
          reason: string
          status: string
          to_name: string
        }[]
      }
      get_people_balances: {
        Args: never
        Returns: {
          avatar_color: string
          avatar_path: string
          balance: number
          name: string
          person_id: string
        }[]
      }
      get_person_ious: {
        Args: { p_limit?: number; p_offset?: number; p_person_id: string }
        Returns: {
          created_at: string
          from_person_id: string
          group_id: string
          iou_date: string
          iou_id: string
          original_amount: number
          paid_amount: number
          reason: string
          to_person_id: string
          total_count: number
        }[]
      }
      get_person_payment_history: {
        Args: { p_limit?: number; p_offset?: number; p_person_id: string }
        Returns: {
          amount: number
          context: string
          from_person_id: string
          note: string
          paid_at: string
          payment_id: string
          payment_type: string
          to_person_id: string
          total_count: number
        }[]
      }
      get_person_shared_expenses: {
        Args: { p_limit?: number; p_offset?: number; p_person_id: string }
        Returns: {
          created_at: string
          expense_date: string
          expense_id: string
          group_id: string
          name: string
          paid_by: string
          self_paid_target: number
          self_share: number
          target_paid_self: number
          target_share: number
          total_amount: number
          total_count: number
        }[]
      }
      get_recent_activity: {
        Args: { p_limit?: number }
        Returns: {
          activity_date: string
          activity_id: string
          activity_type: string
          amount: number
          created_at: string
          title: string
        }[]
      }
      has_my_identity: { Args: never; Returns: boolean }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      record_expense_payment: {
        Args: {
          p_amount: number
          p_expense_id: string
          p_from_person_id: string
          p_note?: string
        }
        Returns: string
      }
      record_iou_payment: {
        Args: { p_amount: number; p_iou_id: string; p_note?: string }
        Returns: string
      }
      remove_group_member: {
        Args: { p_group_id: string; p_person_id: string }
        Returns: undefined
      }
      review_expense_payment: {
        Args: { p_decision: string; p_payment_id: string }
        Returns: undefined
      }
      review_iou_payment: {
        Args: { p_decision: string; p_payment_id: string }
        Returns: undefined
      }
      revoke_group_invite: { Args: { p_invite_id: string }; Returns: undefined }
      transfer_group_ownership: {
        Args: { p_group_id: string; p_new_owner_person_id: string }
        Returns: undefined
      }
      unarchive_group: { Args: { p_group_id: string }; Returns: undefined }
      update_group_settings: {
        Args: {
          p_allow_debtor_self_confirm: boolean
          p_group_id: string
          p_name: string
        }
        Returns: undefined
      }
      update_my_profile: {
        Args: {
          p_avatar_color: string
          p_avatar_path?: string
          p_display_name: string
        }
        Returns: undefined
      }
    }
    Enums: {
      group_invite_status: "pending" | "accepted" | "revoked" | "expired"
      group_member_role: "owner" | "member"
      group_membership_status: "active" | "left" | "removed"
      notification_push_mode: "in_app_only" | "all_important" | "payments_only"
      payment_status: "pending" | "confirmed" | "rejected"
      split_method: "equal" | "amount" | "items"
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
      group_invite_status: ["pending", "accepted", "revoked", "expired"],
      group_member_role: ["owner", "member"],
      group_membership_status: ["active", "left", "removed"],
      notification_push_mode: ["in_app_only", "all_important", "payments_only"],
      payment_status: ["pending", "confirmed", "rejected"],
      split_method: ["equal", "amount", "items"],
    },
  },
} as const
