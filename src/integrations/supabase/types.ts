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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          app_audience: string
          app_description: string
          created_at: string
          id: string
          reference_urls: string[]
          tone_description: string
          tone_key: string
          tone_label: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          app_audience?: string
          app_description?: string
          created_at?: string
          id?: string
          reference_urls?: string[]
          tone_description?: string
          tone_key?: string
          tone_label?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          app_audience?: string
          app_description?: string
          created_at?: string
          id?: string
          reference_urls?: string[]
          tone_description?: string
          tone_key?: string
          tone_label?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string | null
          id: string
          key: string
          last_used_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key?: string
          last_used_at?: string | null
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          last_used_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          article_meta: Json | null
          author_name: string
          automation_name: string | null
          category: string
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string
          faq_html: string
          framer_item_id: string | null
          id: string
          intercom_article_id: string | null
          meta_description: string
          notion_page_id: string | null
          reading_time_minutes: number
          related_article_ids: string[] | null
          shopify_article_id: string | null
          slug: string
          source: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
          wp_permalink: string | null
          wp_post_id: number | null
        }
        Insert: {
          article_meta?: Json | null
          author_name?: string
          automation_name?: string | null
          category?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          faq_html?: string
          framer_item_id?: string | null
          id?: string
          intercom_article_id?: string | null
          meta_description?: string
          notion_page_id?: string | null
          reading_time_minutes?: number
          related_article_ids?: string[] | null
          shopify_article_id?: string | null
          slug: string
          source?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
          wp_permalink?: string | null
          wp_post_id?: number | null
        }
        Update: {
          article_meta?: Json | null
          author_name?: string
          automation_name?: string | null
          category?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          faq_html?: string
          framer_item_id?: string | null
          id?: string
          intercom_article_id?: string | null
          meta_description?: string
          notion_page_id?: string | null
          reading_time_minutes?: number
          related_article_ids?: string[] | null
          shopify_article_id?: string | null
          slug?: string
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          wp_permalink?: string | null
          wp_post_id?: number | null
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          article_id: string | null
          automation_id: string
          error_message: string | null
          id: string
          resolved_prompt: string | null
          run_at: string | null
          status: string | null
        }
        Insert: {
          article_id?: string | null
          automation_id: string
          error_message?: string | null
          id?: string
          resolved_prompt?: string | null
          run_at?: string | null
          status?: string | null
        }
        Update: {
          article_id?: string | null
          automation_id?: string
          error_message?: string | null
          id?: string
          resolved_prompt?: string | null
          run_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          article_length: string | null
          category: string | null
          created_at: string | null
          cron_expression: string
          custom_prompt: string | null
          funnel_stage_filter: string | null
          generate_mode: string
          id: string
          improve_seo: boolean | null
          is_active: boolean | null
          name: string
          next_run_at: string
          notify_email: string | null
          prompt_variables: Json | null
          publish_destinations: string[] | null
          timezone: string
          tone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          article_length?: string | null
          category?: string | null
          created_at?: string | null
          cron_expression: string
          custom_prompt?: string | null
          funnel_stage_filter?: string | null
          generate_mode: string
          id?: string
          improve_seo?: boolean | null
          is_active?: boolean | null
          name: string
          next_run_at: string
          notify_email?: string | null
          prompt_variables?: Json | null
          publish_destinations?: string[] | null
          timezone?: string
          tone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          article_length?: string | null
          category?: string | null
          created_at?: string | null
          cron_expression?: string
          custom_prompt?: string | null
          funnel_stage_filter?: string | null
          generate_mode?: string
          id?: string
          improve_seo?: boolean | null
          is_active?: boolean | null
          name?: string
          next_run_at?: string
          notify_email?: string | null
          prompt_variables?: Json | null
          publish_destinations?: string[] | null
          timezone?: string
          tone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brand_assets: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          name: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string
          file_url: string
          id?: string
          name?: string
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          name?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      canva_designs: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      category_labels: {
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
      content_ideas: {
        Row: {
          article_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          scheduled_for: string | null
          status: string
          strategy: string
          title_suggestion: string
          topic: string
          user_id: string | null
        }
        Insert: {
          article_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          scheduled_for?: string | null
          status?: string
          strategy?: string
          title_suggestion: string
          topic: string
          user_id?: string | null
        }
        Update: {
          article_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          scheduled_for?: string | null
          status?: string
          strategy?: string
          title_suggestion?: string
          topic?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          action: string
          amount: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          amount: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      heygen_templates: {
        Row: {
          active: boolean
          created_at: string | null
          description: string | null
          id: string
          name: string | null
          sort_order: number | null
          template_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          sort_order?: number | null
          template_id: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string | null
          sort_order?: number | null
          template_id?: string
        }
        Relationships: []
      }
      social_post_ideas: {
        Row: {
          canva_design_token: string | null
          created_at: string
          description: string
          id: string
          platform: string
          post_id: string | null
          scheduled_at: string | null
          status: string
          title_suggestion: string
          topic: string
          user_id: string
        }
        Insert: {
          canva_design_token?: string | null
          created_at?: string
          description?: string
          id?: string
          platform: string
          post_id?: string | null
          scheduled_at?: string | null
          status?: string
          title_suggestion: string
          topic: string
          user_id: string
        }
        Update: {
          canva_design_token?: string | null
          created_at?: string
          description?: string
          id?: string
          platform?: string
          post_id?: string | null
          scheduled_at?: string | null
          status?: string
          title_suggestion?: string
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_ideas_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          platform: string
          title: string
          topic: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          platform: string
          title?: string
          topic: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          platform?: string
          title?: string
          topic?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits: number
          id: string
          plan: string
          plan_started_at: string
          stripe_customer_id: string | null
          stripe_payment_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          plan?: string
          plan_started_at?: string
          stripe_customer_id?: string | null
          stripe_payment_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          plan?: string
          plan_started_at?: string
          stripe_customer_id?: string | null
          stripe_payment_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          access_token: string
          created_at: string | null
          id: string
          metadata: Json | null
          platform: string
          platform_user_id: string | null
          platform_user_name: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          platform: string
          platform_user_id?: string | null
          platform_user_name?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          platform?: string
          platform_user_id?: string | null
          platform_user_name?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_api_key_for_user: { Args: { p_user_id: string }; Returns: string }
      deduct_credits: {
        Args: { p_action: string; p_amount: number; p_user_id: string }
        Returns: boolean
      }
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
  public: {
    Enums: {},
  },
} as const
