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
      ambulances: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          empresa_id: string | null
          id: string
          km_per_liter: number | null
          model: string | null
          plate: string | null
          status: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_id?: string | null
          id?: string
          km_per_liter?: number | null
          model?: string | null
          plate?: string | null
          status?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_id?: string | null
          id?: string
          km_per_liter?: number | null
          model?: string | null
          plate?: string | null
          status?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ambulances_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          empresa_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          cost_item_id: string | null
          created_at: string
          empresa_id: string | null
          event_id: string
          id: string
          is_checked: boolean | null
          item_name: string
          item_type: string
          notes: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          cost_item_id?: string | null
          created_at?: string
          empresa_id?: string | null
          event_id: string
          id?: string
          is_checked?: boolean | null
          item_name: string
          item_type: string
          notes?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          cost_item_id?: string | null
          created_at?: string
          empresa_id?: string | null
          event_id?: string
          id?: string
          is_checked?: boolean | null
          item_name?: string
          item_type?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          address: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          empresa_id: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          empresa_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          empresa_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_items: {
        Row: {
          category: string
          created_at: string
          empresa_id: string | null
          id: string
          is_active: boolean
          name: string
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      data_changelog: {
        Row: {
          action: string
          changed_by: string | null
          changed_fields: string[] | null
          created_at: string
          empresa_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_changelog_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_signatures: {
        Row: {
          empresa_id: string | null
          event_id: string
          id: string
          ip_address: string | null
          professional_id: string | null
          profile_id: string
          signature_data: string
          signature_type: Database["public"]["Enums"]["signature_type"]
          signed_at: string
          user_agent: string | null
        }
        Insert: {
          empresa_id?: string | null
          event_id: string
          id?: string
          ip_address?: string | null
          professional_id?: string | null
          profile_id: string
          signature_data: string
          signature_type: Database["public"]["Enums"]["signature_type"]
          signed_at?: string
          user_agent?: string | null
        }
        Update: {
          empresa_id?: string | null
          event_id?: string
          id?: string
          ip_address?: string | null
          professional_id?: string | null
          profile_id?: string
          signature_data?: string
          signature_type?: Database["public"]["Enums"]["signature_type"]
          signed_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_signatures_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_signatures_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_signatures_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_signatures_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_materials: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          name: string
          observation: string | null
          quantity: number
          report_id: string
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          name: string
          observation?: string | null
          quantity?: number
          report_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          name?: string
          observation?: string | null
          quantity?: number
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_materials_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_materials_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dispatch_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_medications: {
        Row: {
          created_at: string
          dose: string | null
          empresa_id: string | null
          id: string
          lot: string | null
          name: string
          quantity: number
          report_id: string
          responsible_id: string | null
          route: string | null
        }
        Insert: {
          created_at?: string
          dose?: string | null
          empresa_id?: string | null
          id?: string
          lot?: string | null
          name: string
          quantity?: number
          report_id: string
          responsible_id?: string | null
          route?: string | null
        }
        Update: {
          created_at?: string
          dose?: string | null
          empresa_id?: string | null
          id?: string
          lot?: string | null
          name?: string
          quantity?: number
          report_id?: string
          responsible_id?: string | null
          route?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_medications_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_medications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dispatch_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_medications_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_medications_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_occurrences: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          observation: string | null
          occurrence_name: string
          quantity: number
          report_id: string
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          observation?: string | null
          occurrence_name: string
          quantity?: number
          report_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          observation?: string | null
          occurrence_name?: string
          quantity?: number
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_occurrences_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_occurrences_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dispatch_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_reports: {
        Row: {
          base_arrival: string | null
          base_departure: string | null
          created_at: string
          created_by: string | null
          empresa_id: string | null
          end_time: string | null
          event_arrival: string | null
          event_id: string
          id: string
          observations: string | null
          signed_at: string | null
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          base_arrival?: string | null
          base_departure?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          end_time?: string | null
          event_arrival?: string | null
          event_id: string
          id?: string
          observations?: string | null
          signed_at?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          base_arrival?: string | null
          base_departure?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          end_time?: string | null
          event_arrival?: string | null
          event_id?: string
          id?: string
          observations?: string | null
          signed_at?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_reports_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj: string | null
          created_at: string
          data_inicio: string | null
          data_vencimento: string | null
          email: string | null
          endereco: string | null
          id: string
          limite_eventos_mensais: number | null
          limite_usuarios: number | null
          nome_fantasia: string
          plano: Database["public"]["Enums"]["plano_empresa"]
          razao_social: string | null
          status_assinatura: Database["public"]["Enums"]["status_assinatura"]
          telefone: string | null
          updated_at: string
          valor_plano: number | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          data_inicio?: string | null
          data_vencimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          limite_eventos_mensais?: number | null
          limite_usuarios?: number | null
          nome_fantasia: string
          plano?: Database["public"]["Enums"]["plano_empresa"]
          razao_social?: string | null
          status_assinatura?: Database["public"]["Enums"]["status_assinatura"]
          telefone?: string | null
          updated_at?: string
          valor_plano?: number | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          data_inicio?: string | null
          data_vencimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          limite_eventos_mensais?: number | null
          limite_usuarios?: number | null
          nome_fantasia?: string
          plano?: Database["public"]["Enums"]["plano_empresa"]
          razao_social?: string | null
          status_assinatura?: Database["public"]["Enums"]["status_assinatura"]
          telefone?: string | null
          updated_at?: string
          valor_plano?: number | null
        }
        Relationships: []
      }
      event_finance_payments: {
        Row: {
          amount: number
          cancelled: boolean
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          empresa_id: string | null
          event_finance_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
        }
        Insert: {
          amount: number
          cancelled?: boolean
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          event_finance_id: string
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
        }
        Update: {
          amount?: number
          cancelled?: boolean
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          event_finance_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_finance_payments_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_finance_payments_event_finance_id_fkey"
            columns: ["event_finance_id"]
            isOneToOne: false
            referencedRelation: "event_finances"
            referencedColumns: ["id"]
          },
        ]
      }
      event_finances: {
        Row: {
          additions: number
          contract_value: number
          contractor_id: string | null
          created_at: string
          created_by: string | null
          discounts: number
          due_date: string | null
          empresa_id: string | null
          event_id: string
          id: string
          notes: string | null
          payment_method: string | null
          status: string
          updated_at: string
        }
        Insert: {
          additions?: number
          contract_value?: number
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          discounts?: number
          due_date?: string | null
          empresa_id?: string | null
          event_id: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          additions?: number
          contract_value?: number
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          discounts?: number
          due_date?: string | null
          empresa_id?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_finances_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_finances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_other_costs: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          empresa_id: string | null
          event_id: string
          id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id?: string | null
          event_id: string
          id?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id?: string | null
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_other_costs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_other_costs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          event_id: string
          id: string
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          event_id: string
          id?: string
          joined_at?: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          event_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      event_recordings: {
        Row: {
          device_info: string | null
          duration_seconds: number | null
          empresa_id: string | null
          ended_at: string | null
          event_id: string
          file_hash: string | null
          file_size_bytes: number | null
          id: string
          latitude: number | null
          longitude: number | null
          profile_id: string | null
          started_at: string
          status: string
          user_id: string
          video_type: string
          video_url: string | null
        }
        Insert: {
          device_info?: string | null
          duration_seconds?: number | null
          empresa_id?: string | null
          ended_at?: string | null
          event_id: string
          file_hash?: string | null
          file_size_bytes?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          profile_id?: string | null
          started_at?: string
          status?: string
          user_id: string
          video_type: string
          video_url?: string | null
        }
        Update: {
          device_info?: string | null
          duration_seconds?: number | null
          empresa_id?: string | null
          ended_at?: string | null
          event_id?: string
          file_hash?: string | null
          file_size_bytes?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          profile_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
          video_type?: string
          video_url?: string | null
        }
        Relationships: []
      }
      event_staff_costs: {
        Row: {
          base_value: number
          created_at: string
          discounts: number
          empresa_id: string | null
          event_id: string
          extras: number
          id: string
          notes: string | null
          payment_type: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          base_value?: number
          created_at?: string
          discounts?: number
          empresa_id?: string | null
          event_id: string
          extras?: number
          id?: string
          notes?: string | null
          payment_type?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          base_value?: number
          created_at?: string
          discounts?: number
          empresa_id?: string | null
          event_id?: string
          extras?: number
          id?: string
          notes?: string | null
          payment_type?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_costs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_costs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_costs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_costs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          ambulance_id: string | null
          arrival_time: string | null
          code: string
          contractor_id: string | null
          contractor_phone: string | null
          contractor_responsible: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          departure_time: string | null
          description: string | null
          empresa_id: string | null
          id: string
          location: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
        }
        Insert: {
          ambulance_id?: string | null
          arrival_time?: string | null
          code: string
          contractor_id?: string | null
          contractor_phone?: string | null
          contractor_responsible?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          departure_time?: string | null
          description?: string | null
          empresa_id?: string | null
          id?: string
          location?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Update: {
          ambulance_id?: string | null
          arrival_time?: string | null
          code?: string
          contractor_id?: string | null
          contractor_phone?: string | null
          contractor_responsible?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          departure_time?: string | null
          description?: string | null
          empresa_id?: string | null
          id?: string
          location?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_ambulance_id_fkey"
            columns: ["ambulance_id"]
            isOneToOne: false
            referencedRelation: "ambulances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_payments: {
        Row: {
          cancelled: boolean
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          empresa_id: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          profile_id: string
          receipt_url: string | null
          reference_month: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancelled?: boolean
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          profile_id: string
          receipt_url?: string | null
          reference_month: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cancelled?: boolean
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          profile_id?: string
          receipt_url?: string | null
          reference_month?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_payments_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          ambulance_id: string
          cost: number | null
          created_at: string | null
          created_by: string | null
          description: string
          empresa_id: string | null
          id: string
          maintenance_date: string
          notes: string | null
          performed_by: string | null
          updated_at: string | null
        }
        Insert: {
          ambulance_id: string
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          description: string
          empresa_id?: string | null
          id?: string
          maintenance_date?: string
          notes?: string | null
          performed_by?: string | null
          updated_at?: string | null
        }
        Update: {
          ambulance_id?: string
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          empresa_id?: string | null
          id?: string
          maintenance_date?: string
          notes?: string | null
          performed_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_ambulance_id_fkey"
            columns: ["ambulance_id"]
            isOneToOne: false
            referencedRelation: "ambulances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_evolutions: {
        Row: {
          conduct: string | null
          created_at: string
          created_by: string | null
          diagnosis: string | null
          empresa_id: string | null
          event_id: string
          id: string
          medical_assessment: string | null
          observations: string | null
          patient_id: string | null
          prescription: string | null
          signature_data: string | null
          signed_at: string | null
          updated_at: string
        }
        Insert: {
          conduct?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          empresa_id?: string | null
          event_id: string
          id?: string
          medical_assessment?: string | null
          observations?: string | null
          patient_id?: string | null
          prescription?: string | null
          signature_data?: string | null
          signed_at?: string | null
          updated_at?: string
        }
        Update: {
          conduct?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          empresa_id?: string | null
          event_id?: string
          id?: string
          medical_assessment?: string | null
          observations?: string | null
          patient_id?: string | null
          prescription?: string | null
          signature_data?: string | null
          signed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_evolutions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_evolutions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_evolutions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_evolutions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_evolutions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          id: string
          reference_id: string
          sent_at: string
          type: string
          user_id: string
        }
        Insert: {
          id?: string
          reference_id: string
          sent_at?: string
          type: string
          user_id: string
        }
        Update: {
          id?: string
          reference_id?: string
          sent_at?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nursing_evolutions: {
        Row: {
          blood_glucose: number | null
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          created_at: string
          created_by: string | null
          empresa_id: string | null
          event_id: string
          heart_rate: number | null
          id: string
          medications_administered: string | null
          observations: string | null
          oxygen_saturation: number | null
          patient_id: string | null
          procedures: string | null
          respiratory_rate: number | null
          signature_data: string | null
          signed_at: string | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          blood_glucose?: number | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          event_id: string
          heart_rate?: number | null
          id?: string
          medications_administered?: string | null
          observations?: string | null
          oxygen_saturation?: number | null
          patient_id?: string | null
          procedures?: string | null
          respiratory_rate?: number | null
          signature_data?: string | null
          signed_at?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          blood_glucose?: number | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          event_id?: string
          heart_rate?: number | null
          id?: string
          medications_administered?: string | null
          observations?: string | null
          oxygen_saturation?: number | null
          patient_id?: string | null
          procedures?: string | null
          respiratory_rate?: number | null
          signature_data?: string | null
          signed_at?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursing_evolutions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursing_evolutions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursing_evolutions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursing_evolutions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursing_evolutions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          empresa_id: string | null
          end_time: string | null
          event_date: string
          id: string
          location: string | null
          roles_needed: string[]
          start_time: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id?: string | null
          end_time?: string | null
          event_date: string
          id?: string
          location?: string | null
          roles_needed?: string[]
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id?: string | null
          end_time?: string | null
          event_date?: string
          id?: string
          location?: string | null
          roles_needed?: string[]
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_registrations: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          empresa_id: string | null
          id: string
          opportunity_id: string
          profile_id: string
          registered_at: string
          role: string
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          empresa_id?: string | null
          id?: string
          opportunity_id: string
          profile_id: string
          registered_at?: string
          role: string
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          empresa_id?: string | null
          id?: string
          opportunity_id?: string
          profile_id?: string
          registered_at?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_registrations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_registrations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_registrations_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_registrations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_registrations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_registrations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: number | null
          allergies: string | null
          birth_date: string | null
          brief_history: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          current_medications: string | null
          deleted_at: string | null
          deleted_by: string | null
          empresa_id: string | null
          event_id: string
          gender: string | null
          id: string
          main_complaint: string | null
          name: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          allergies?: string | null
          birth_date?: string | null
          brief_history?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          current_medications?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_id?: string | null
          event_id: string
          gender?: string | null
          id?: string
          main_complaint?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          allergies?: string | null
          birth_date?: string | null
          brief_history?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          current_medications?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          empresa_id?: string | null
          event_id?: string
          gender?: string | null
          id?: string
          main_complaint?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          empresa_id: string | null
          full_name: string
          id: string
          must_change_password: boolean | null
          phone: string | null
          pin_code: string | null
          professional_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          empresa_id?: string | null
          full_name: string
          id?: string
          must_change_password?: boolean | null
          phone?: string | null
          pin_code?: string | null
          professional_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          empresa_id?: string | null
          full_name?: string
          id?: string
          must_change_password?: boolean | null
          phone?: string | null
          pin_code?: string | null
          professional_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          approved: boolean
          author_name: string
          author_role: string | null
          content: string
          created_at: string
          empresa_id: string | null
          id: string
          profile_id: string
          rating: number
          updated_at: string
        }
        Insert: {
          approved?: boolean
          author_name: string
          author_role?: string | null
          content: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          profile_id: string
          rating?: number
          updated_at?: string
        }
        Update: {
          approved?: boolean
          author_name?: string
          author_role?: string | null
          content?: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          profile_id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      transport_records: {
        Row: {
          arrival_time: string | null
          created_at: string
          created_by: string | null
          departure_time: string | null
          empresa_id: string | null
          event_id: string
          final_km: number | null
          id: string
          initial_km: number | null
          occurrences: string | null
          signed_at: string | null
          updated_at: string
        }
        Insert: {
          arrival_time?: string | null
          created_at?: string
          created_by?: string | null
          departure_time?: string | null
          empresa_id?: string | null
          event_id: string
          final_km?: number | null
          id?: string
          initial_km?: number | null
          occurrences?: string | null
          signed_at?: string | null
          updated_at?: string
        }
        Update: {
          arrival_time?: string | null
          created_at?: string
          created_by?: string | null
          departure_time?: string | null
          empresa_id?: string | null
          event_id?: string
          final_km?: number | null
          id?: string
          initial_km?: number | null
          occurrences?: string | null
          signed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_records_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_records_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_safe: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          empresa_id: string | null
          full_name: string | null
          id: string | null
          must_change_password: boolean | null
          phone: string | null
          pin_code: string | null
          professional_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          empresa_id?: string | null
          full_name?: string | null
          id?: string | null
          must_change_password?: boolean | null
          phone?: string | null
          pin_code?: never
          professional_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          empresa_id?: string | null
          full_name?: string | null
          id?: string | null
          must_change_password?: boolean | null
          phone?: string | null
          pin_code?: never
          professional_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_plan_access: { Args: { modulo: string }; Returns: boolean }
      get_empresa_id: { Args: never; Returns: string }
      get_empresa_plano: {
        Args: never
        Returns: Database["public"]["Enums"]["plano_empresa"]
      }
      get_empresa_status: {
        Args: never
        Returns: Database["public"]["Enums"]["status_assinatura"]
      }
      get_event_role: {
        Args: { _event_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_profile_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_event_participant: { Args: { _event_id: string }; Returns: boolean }
      is_event_signed: { Args: { _event_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      same_empresa: { Args: { _empresa_id: string }; Returns: boolean }
      same_empresa_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "condutor" | "enfermeiro" | "medico" | "tecnico"
      event_status: "ativo" | "em_andamento" | "finalizado" | "cancelado"
      plano_empresa: "OPERACIONAL" | "GESTAO_EQUIPE" | "GESTAO_COMPLETA"
      signature_type: "enfermagem" | "medica" | "transporte" | "checklist"
      status_assinatura:
        | "ATIVA"
        | "PENDENTE"
        | "SUSPENSA"
        | "CANCELADA"
        | "TRIAL"
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
      app_role: ["admin", "condutor", "enfermeiro", "medico", "tecnico"],
      event_status: ["ativo", "em_andamento", "finalizado", "cancelado"],
      plano_empresa: ["OPERACIONAL", "GESTAO_EQUIPE", "GESTAO_COMPLETA"],
      signature_type: ["enfermagem", "medica", "transporte", "checklist"],
      status_assinatura: [
        "ATIVA",
        "PENDENTE",
        "SUSPENSA",
        "CANCELADA",
        "TRIAL",
      ],
    },
  },
} as const
