export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      employees: {
        Row: {
          allowance: number
          bank_account: string | null
          base_salary: number
          code: string | null
          created_at: string
          email: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          end_date: string | null
          full_name: string
          hourly_rate: number
          id: string
          is_active: boolean
          note: string | null
          phone: string | null
          position: string | null
          standard_days_per_month: number
          start_date: string | null
          updated_at: string
        }
        Insert: {
          allowance?: number
          bank_account?: string | null
          base_salary?: number
          code?: string | null
          created_at?: string
          email?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          full_name: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          note?: string | null
          phone?: string | null
          position?: string | null
          standard_days_per_month?: number
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          allowance?: number
          bank_account?: string | null
          base_salary?: number
          code?: string | null
          created_at?: string
          email?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          full_name?: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          note?: string | null
          phone?: string | null
          position?: string | null
          standard_days_per_month?: number
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          description: string | null
          expense_type: Database["public"]["Enums"]["expense_type"]
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expense_type?: Database["public"]["Enums"]["expense_type"]
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expense_type?: Database["public"]["Enums"]["expense_type"]
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      expense_records: {
        Row: {
          amount: number
          attachment_url: string | null
          category_id: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          invoice_number: string | null
          note: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["expense_status"]
          title: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          invoice_number?: string | null
          note?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["expense_status"]
          title: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          invoice_number?: string | null
          note?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["expense_status"]
          title?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_records_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          avg_cost_price: number
          base_unit: string
          category: string | null
          code: string | null
          conversion_factor: number
          created_at: string
          current_stock: number
          default_supplier_id: string | null
          id: string
          import_unit: string
          is_active: boolean
          min_alert_stock: number
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          avg_cost_price?: number
          base_unit: string
          category?: string | null
          code?: string | null
          conversion_factor: number
          created_at?: string
          current_stock?: number
          default_supplier_id?: string | null
          id?: string
          import_unit: string
          is_active?: boolean
          min_alert_stock?: number
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          avg_cost_price?: number
          base_unit?: string
          category?: string | null
          code?: string | null
          conversion_factor?: number
          created_at?: string
          current_stock?: number
          default_supplier_id?: string | null
          id?: string
          import_unit?: string
          is_active?: boolean
          min_alert_stock?: number
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_debt_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
          note: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          stock_after: number | null
          total_cost: number | null
          txn_type: Database["public"]["Enums"]["inventory_txn_type"]
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id: string
          note?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          stock_after?: number | null
          total_cost?: number | null
          txn_type: Database["public"]["Enums"]["inventory_txn_type"]
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id?: string
          note?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          stock_after?: number | null
          total_cost?: number | null
          txn_type?: Database["public"]["Enums"]["inventory_txn_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_inventory_status"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          selling_price: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          selling_price?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          selling_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cogs_amount: number
          created_at: string
          id: string
          line_total: number | null
          menu_item_id: string
          menu_item_name: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          cogs_amount?: number
          created_at?: string
          id?: string
          line_total?: number | null
          menu_item_id: string
          menu_item_name: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          cogs_amount?: number
          created_at?: string
          id?: string
          line_total?: number | null
          menu_item_id?: string
          menu_item_name?: string
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_menu_engineering"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_menu_item_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string | null
          discount: number
          id: string
          note: string | null
          order_date: string
          order_number: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_number: string | null
          total_amount: number
          total_cogs: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          note?: string | null
          order_date?: string
          order_number?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_number?: string | null
          total_amount?: number
          total_cogs?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          note?: string | null
          order_date?: string
          order_number?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_number?: string | null
          total_amount?: number
          total_cogs?: number
          updated_at?: string
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
          advance_deduction: number
          allowance: number
          base_pay: number
          bonus: number
          created_at: string
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          id: string
          is_paid: boolean
          net_pay: number | null
          note: string | null
          paid_at: string | null
          payroll_period_id: string
          penalty: number
          tips: number
          total_days: number
          total_hours: number
          updated_at: string
        }
        Insert: {
          advance_deduction?: number
          allowance?: number
          base_pay?: number
          bonus?: number
          created_at?: string
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          id?: string
          is_paid?: boolean
          net_pay?: number | null
          note?: string | null
          paid_at?: string | null
          payroll_period_id: string
          penalty?: number
          tips?: number
          total_days?: number
          total_hours?: number
          updated_at?: string
        }
        Update: {
          advance_deduction?: number
          allowance?: number
          base_pay?: number
          bonus?: number
          created_at?: string
          employee_id?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          id?: string
          is_paid?: boolean
          net_pay?: number | null
          note?: string | null
          paid_at?: string | null
          payroll_period_id?: string
          penalty?: number
          tips?: number
          total_days?: number
          total_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          created_at: string
          finalized_at: string | null
          id: string
          name: string
          note: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["payroll_status"]
          total_net_pay: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          name: string
          note?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_net_pay?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          id?: string
          name?: string
          note?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_net_pay?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          base_quantity: number | null
          conversion_factor: number
          created_at: string
          id: string
          ingredient_id: string
          line_total: number | null
          purchase_order_id: string
          quantity: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          base_quantity?: number | null
          conversion_factor: number
          created_at?: string
          id?: string
          ingredient_id: string
          line_total?: number | null
          purchase_order_id: string
          quantity: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          base_quantity?: number | null
          conversion_factor?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          line_total?: number | null
          purchase_order_id?: string
          quantity?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_inventory_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_orders_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          debt_amount: number | null
          due_date: string | null
          id: string
          invoice_number: string | null
          note: string | null
          order_date: string
          paid_amount: number
          payment_status: Database["public"]["Enums"]["po_payment_status"]
          po_number: string | null
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          debt_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          note?: string | null
          order_date?: string
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["po_payment_status"]
          po_number?: string | null
          supplier_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          debt_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          note?: string | null
          order_date?: string
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["po_payment_status"]
          po_number?: string | null
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_debt_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          menu_item_id: string
          note: string | null
          quantity: number
          updated_at: string
          waste_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          menu_item_id: string
          note?: string | null
          quantity: number
          updated_at?: string
          waste_percent?: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          menu_item_id?: string
          note?: string | null
          quantity?: number
          updated_at?: string
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_inventory_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_menu_engineering"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_menu_item_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          purchase_order_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id: string
          purchase_order_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          purchase_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payment_allocations_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_orders_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          payment_date: string
          purchase_order_id: string | null
          reference: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          payment_date?: string
          purchase_order_id?: string | null
          reference?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          payment_date?: string
          purchase_order_id?: string | null
          reference?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_orders_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_debt_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          code: string | null
          contact_name: string | null
          created_at: string
          current_debt: number
          email: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          payment_terms_days: number
          phone: string | null
          tax_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          contact_name?: string | null
          created_at?: string
          current_debt?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          payment_terms_days?: number
          phone?: string | null
          tax_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          contact_name?: string | null
          created_at?: string
          current_debt?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          payment_terms_days?: number
          phone?: string | null
          tax_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      timekeeping: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          hours_worked: number
          id: string
          note: string | null
          shift: string | null
          updated_at: string
          work_date: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours_worked: number
          id?: string
          note?: string | null
          shift?: string | null
          updated_at?: string
          work_date: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours_worked?: number
          id?: string
          note?: string | null
          shift?: string | null
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "timekeeping_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_daily_sales: {
        Row: {
          avg_order_value: number | null
          cogs: number | null
          discount_total: number | null
          gross_margin_pct: number | null
          gross_profit: number | null
          order_count: number | null
          revenue: number | null
          sales_date: string | null
        }
        Relationships: []
      }
      v_inventory_status: {
        Row: {
          avg_cost_per_import_unit: number | null
          avg_cost_price: number | null
          base_unit: string | null
          category: string | null
          code: string | null
          conversion_factor: number | null
          created_at: string | null
          current_stock: number | null
          default_supplier_id: string | null
          default_supplier_name: string | null
          id: string | null
          import_unit: string | null
          is_active: boolean | null
          is_below_min: boolean | null
          min_alert_stock: number | null
          name: string | null
          note: string | null
          stock_in_import_units: number | null
          stock_value: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_debt_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      v_menu_engineering: {
        Row: {
          avg_cm: number | null
          benchmark_cm: number | null
          category: string | null
          code: string | null
          contribution_margin: number | null
          food_cost_pct: number | null
          id: string | null
          ideal_cost: number | null
          is_popular: boolean | null
          is_profitable: boolean | null
          menu_class: Database["public"]["Enums"]["menu_class"] | null
          missing_recipe: boolean | null
          name: string | null
          popularity_share: number | null
          popularity_threshold: number | null
          qty_sold: number | null
          revenue: number | null
          selling_price: number | null
          total_cm: number | null
        }
        Relationships: []
      }
      v_menu_item_costs: {
        Row: {
          category: string | null
          code: string | null
          contribution_margin: number | null
          created_at: string | null
          food_cost_pct: number | null
          id: string | null
          ideal_cost: number | null
          image_url: string | null
          ingredient_count: number | null
          is_active: boolean | null
          missing_recipe: boolean | null
          name: string | null
          selling_price: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_purchase_orders_summary: {
        Row: {
          created_at: string | null
          created_by: string | null
          days_overdue: number | null
          debt_amount: number | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          is_overdue: boolean | null
          item_count: number | null
          note: string | null
          order_date: string | null
          paid_amount: number | null
          payment_status:
            | Database["public"]["Enums"]["po_payment_status"]
            | null
          po_number: string | null
          supplier_code: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_debt_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      v_recipe_costs: {
        Row: {
          avg_cost_price: number | null
          base_unit: string | null
          component_cost: number | null
          created_at: string | null
          effective_quantity: number | null
          id: string | null
          ingredient_category: string | null
          ingredient_code: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          menu_item_id: string | null
          note: string | null
          quantity: number | null
          updated_at: string | null
          waste_percent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_inventory_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_menu_engineering"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_menu_item_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      v_supplier_debt_summary: {
        Row: {
          code: string | null
          current_debt: number | null
          id: string | null
          is_active: boolean | null
          last_order_date: string | null
          name: string | null
          next_due_date: string | null
          overdue_debt: number | null
          overdue_po_count: number | null
          payment_terms_days: number | null
          phone: string | null
          po_count: number | null
          total_paid: number | null
          total_purchased: number | null
          unpaid_po_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      app_setting_bool: {
        Args: { p_default?: boolean; p_key: string }
        Returns: boolean
      }
      app_timezone: { Args: never; Returns: string }
      cancel_order: { Args: { p_order_id: string }; Returns: undefined }
      create_order: {
        Args: {
          p_discount?: number
          p_items: Json
          p_note?: string
          p_order_date?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_table_number?: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_due_date: string
          p_invoice_number: string
          p_items: Json
          p_note: string
          p_order_date: string
          p_paid_method?: Database["public"]["Enums"]["payment_method"]
          p_paid_now?: number
          p_supplier_id: string
        }
        Returns: string
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      finalize_payroll: { Args: { p_period_id: string }; Returns: undefined }
      generate_payroll: {
        Args: { p_period_id: string }
        Returns: {
          advance_deduction: number
          allowance: number
          base_pay: number
          bonus: number
          created_at: string
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          id: string
          is_paid: boolean
          net_pay: number | null
          note: string | null
          paid_at: string | null
          payroll_period_id: string
          penalty: number
          tips: number
          total_days: number
          total_hours: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payroll_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_pnl_monthly: {
        Args: { p_year: number }
        Returns: {
          cogs_total: number
          gross_profit: number
          labor_cost: number
          month: number
          month_start: string
          net_profit: number
          opex_total: number
          revenue: number
        }[]
      }
      get_pnl_report: {
        Args: { p_end: string; p_start: string }
        Returns: {
          avg_order_value: number
          cogs_sales: number
          cogs_total: number
          cogs_waste: number
          gross_margin_pct: number
          gross_profit: number
          labor_cost: number
          net_margin_pct: number
          net_profit: number
          opex_fixed: number
          opex_total: number
          opex_variable: number
          order_count: number
          revenue: number
        }[]
      }
      is_manager: { Args: never; Returns: boolean }
      local_day_start: { Args: { p_date: string }; Returns: string }
      next_order_number: { Args: { p_date?: string }; Returns: string }
      next_po_number: { Args: { p_date?: string }; Returns: string }
      pay_payroll: {
        Args: {
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_paid_at?: string
          p_period_id: string
        }
        Returns: undefined
      }
      record_stock_adjustment: {
        Args: {
          p_ingredient_id: string
          p_note?: string
          p_quantity: number
          p_txn_type: Database["public"]["Enums"]["inventory_txn_type"]
        }
        Returns: string
      }
      record_supplier_payment: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_payment_date: string
          p_purchase_order_id?: string
          p_reference?: string
          p_supplier_id: string
        }
        Returns: string
      }
      reopen_payroll: { Args: { p_period_id: string }; Returns: undefined }
      to_local_date: { Args: { p_ts: string }; Returns: string }
    }
    Enums: {
      employment_type: "full_time" | "part_time"
      expense_status: "pending" | "paid"
      expense_type: "fixed" | "variable"
      inventory_txn_type:
        | "purchase"
        | "sale"
        | "sale_reversal"
        | "waste"
        | "adjustment"
        | "stocktake"
      menu_class: "star" | "plowhorse" | "puzzle" | "dog"
      order_status: "completed" | "cancelled"
      payment_method: "cash" | "bank_transfer"
      payroll_status: "draft" | "finalized" | "paid"
      po_payment_status: "unpaid" | "partial" | "paid"
      user_role: "owner" | "manager" | "staff"
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
  public: {
    Enums: {
      employment_type: ["full_time", "part_time"],
      expense_status: ["pending", "paid"],
      expense_type: ["fixed", "variable"],
      inventory_txn_type: [
        "purchase",
        "sale",
        "sale_reversal",
        "waste",
        "adjustment",
        "stocktake",
      ],
      menu_class: ["star", "plowhorse", "puzzle", "dog"],
      order_status: ["completed", "cancelled"],
      payment_method: ["cash", "bank_transfer"],
      payroll_status: ["draft", "finalized", "paid"],
      po_payment_status: ["unpaid", "partial", "paid"],
      user_role: ["owner", "manager", "staff"],
    },
  },
} as const

