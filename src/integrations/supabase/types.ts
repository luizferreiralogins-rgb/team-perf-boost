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
  public: {
    Tables: {
      lead_transferencias: {
        Row: {
          created_at: string
          from_user: string
          id: string
          lead_id: string
          mensagem: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_user: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          lead_id: string
          mensagem?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_user: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          lead_id?: string
          mensagem?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_user?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_transferencias_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cidade: string | null
          created_at: string
          email: string | null
          fonte: string | null
          id: string
          nome: string
          observacoes: string | null
          produto_interesse: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          vendedor_id: string
          whatsapp: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          email?: string | null
          fonte?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          produto_interesse?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          vendedor_id: string
          whatsapp?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string
          email?: string | null
          fonte?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          produto_interesse?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          vendedor_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      parametros_loja_faixas_ticket: {
        Row: {
          diff_ate: number
          diff_de: number
          faixa_0: number
          faixa_1: number
          faixa_2: number
          faixa_3: number
          id: number
        }
        Insert: {
          diff_ate: number
          diff_de: number
          faixa_0: number
          faixa_1: number
          faixa_2: number
          faixa_3: number
          id?: number
        }
        Update: {
          diff_ate?: number
          diff_de?: number
          faixa_0?: number
          faixa_1?: number
          faixa_2?: number
          faixa_3?: number
          id?: number
        }
        Relationships: []
      }
      parametros_loja_metas: {
        Row: {
          faixa: number
          meta_receita: number
          meta_renov_movel: number
        }
        Insert: {
          faixa: number
          meta_receita: number
          meta_renov_movel: number
        }
        Update: {
          faixa?: number
          meta_receita?: number
          meta_renov_movel?: number
        }
        Relationships: []
      }
      parametros_loja_novos_produtos: {
        Row: {
          codigo: string
          nome: string
          percentual: number
        }
        Insert: {
          codigo: string
          nome: string
          percentual: number
        }
        Update: {
          codigo?: string
          nome?: string
          percentual?: number
        }
        Relationships: []
      }
      parametros_pap_faixas: {
        Row: {
          acelerador_baixo_cancel: number
          bonus_venda_indireta: number
          faixa: number
          id: number
          meta_max_cancel: number
          pct_comissao: number
          receita_ate: number
          receita_de: number
        }
        Insert: {
          acelerador_baixo_cancel: number
          bonus_venda_indireta: number
          faixa: number
          id?: number
          meta_max_cancel: number
          pct_comissao: number
          receita_ate: number
          receita_de: number
        }
        Update: {
          acelerador_baixo_cancel?: number
          bonus_venda_indireta?: number
          faixa?: number
          id?: number
          meta_max_cancel?: number
          pct_comissao?: number
          receita_ate?: number
          receita_de?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          canal: Database["public"]["Enums"]["canal_venda"]
          cidade: string | null
          created_at: string
          email: string | null
          gerente_id: string | null
          id: string
          loja_unidade: Database["public"]["Enums"]["loja_unidade"] | null
          nome: string
          regional_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          canal?: Database["public"]["Enums"]["canal_venda"]
          cidade?: string | null
          created_at?: string
          email?: string | null
          gerente_id?: string | null
          id: string
          loja_unidade?: Database["public"]["Enums"]["loja_unidade"] | null
          nome?: string
          regional_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          canal?: Database["public"]["Enums"]["canal_venda"]
          cidade?: string | null
          created_at?: string
          email?: string | null
          gerente_id?: string | null
          id?: string
          loja_unidade?: Database["public"]["Enums"]["loja_unidade"] | null
          nome?: string
          regional_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_regional_id_fkey"
            columns: ["regional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_mensagens: {
        Row: {
          autor: string | null
          chat_id: number
          created_at: string
          direcao: string
          id: string
          texto: string | null
          update_id: number | null
          user_id: string
        }
        Insert: {
          autor?: string | null
          chat_id: number
          created_at?: string
          direcao: string
          id?: string
          texto?: string | null
          update_id?: number | null
          user_id: string
        }
        Update: {
          autor?: string | null
          chat_id?: number
          created_at?: string
          direcao?: string
          id?: string
          texto?: string | null
          update_id?: number | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_vinculos: {
        Row: {
          chat_id: number | null
          created_at: string
          telegram_nome: string | null
          telegram_username: string | null
          token: string
          updated_at: string
          user_id: string
          vinculado_em: string | null
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          telegram_nome?: string | null
          telegram_username?: string | null
          token: string
          updated_at?: string
          user_id: string
          vinculado_em?: string | null
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          telegram_nome?: string | null
          telegram_username?: string | null
          token?: string
          updated_at?: string
          user_id?: string
          vinculado_em?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendas_loja: {
        Row: {
          classe_protocolo: string | null
          comissao: number
          contem_movel: boolean
          cpf_cnpj: string | null
          created_at: string
          data_abertura: string | null
          data_ativacao: string | null
          id: string
          mes_ref: string
          meses_fidelidade: number | null
          nome_cliente: string
          observacoes: string | null
          protocolo: string | null
          qtd_linhas: number
          status: Database["public"]["Enums"]["venda_status"]
          tecnologia: string | null
          tipo_comissao: string | null
          updated_at: string
          valor_antigo: number | null
          valor_novo: number
          vendedor_id: string
        }
        Insert: {
          classe_protocolo?: string | null
          comissao?: number
          contem_movel?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          data_abertura?: string | null
          data_ativacao?: string | null
          id?: string
          mes_ref?: string
          meses_fidelidade?: number | null
          nome_cliente: string
          observacoes?: string | null
          protocolo?: string | null
          qtd_linhas?: number
          status?: Database["public"]["Enums"]["venda_status"]
          tecnologia?: string | null
          tipo_comissao?: string | null
          updated_at?: string
          valor_antigo?: number | null
          valor_novo?: number
          vendedor_id: string
        }
        Update: {
          classe_protocolo?: string | null
          comissao?: number
          contem_movel?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          data_abertura?: string | null
          data_ativacao?: string | null
          id?: string
          mes_ref?: string
          meses_fidelidade?: number | null
          nome_cliente?: string
          observacoes?: string | null
          protocolo?: string | null
          qtd_linhas?: number
          status?: Database["public"]["Enums"]["venda_status"]
          tecnologia?: string | null
          tipo_comissao?: string | null
          updated_at?: string
          valor_antigo?: number | null
          valor_novo?: number
          vendedor_id?: string
        }
        Relationships: []
      }
      vendas_pap: {
        Row: {
          bairro: string | null
          cidade: string | null
          comissao: number
          cpf_cnpj: string | null
          created_at: string
          data_ativacao: string | null
          data_venda: string
          endereco: string | null
          id: string
          mes_ref: string
          nome_cliente: string
          observacoes: string | null
          produto: string | null
          status: Database["public"]["Enums"]["venda_status"]
          tecnologia: string | null
          telefone: string | null
          updated_at: string
          valor: number
          vendedor_id: string
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          comissao?: number
          cpf_cnpj?: string | null
          created_at?: string
          data_ativacao?: string | null
          data_venda?: string
          endereco?: string | null
          id?: string
          mes_ref?: string
          nome_cliente: string
          observacoes?: string | null
          produto?: string | null
          status?: Database["public"]["Enums"]["venda_status"]
          tecnologia?: string | null
          telefone?: string | null
          updated_at?: string
          valor?: number
          vendedor_id: string
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          comissao?: number
          cpf_cnpj?: string | null
          created_at?: string
          data_ativacao?: string | null
          data_venda?: string
          endereco?: string | null
          id?: string
          mes_ref?: string
          nome_cliente?: string
          observacoes?: string | null
          produto?: string | null
          status?: Database["public"]["Enums"]["venda_status"]
          tecnologia?: string | null
          telefone?: string | null
          updated_at?: string
          valor?: number
          vendedor_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceitar_transferencia_lead: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      buscar_lead_duplicado: {
        Args: { _email: string; _whatsapp: string }
        Returns: {
          email: string
          lead_id: string
          nome: string
          vendedor_id: string
          vendedor_nome: string
          whatsapp: string
        }[]
      }
      get_canal: {
        Args: { _user: string }
        Returns: Database["public"]["Enums"]["canal_venda"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_gestor_de: {
        Args: { _consultant: string; _manager: string }
        Returns: boolean
      }
      pode_gerenciar: {
        Args: { _manager: string; _target: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "consultor" | "gerente" | "regional" | "admin"
      canal_venda: "loja" | "pap"
      lead_status:
        | "contato_feito"
        | "negociando"
        | "desistiu"
        | "fechou"
        | "nao_perturbar"
        | "transferido"
      loja_unidade: "norte" | "sul" | "shopping"
      transfer_status: "pendente" | "aceita" | "recusada" | "cancelada"
      venda_status: "pendente" | "instalado" | "cancelado" | "em_analise"
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
      app_role: ["consultor", "gerente", "regional", "admin"],
      canal_venda: ["loja", "pap"],
      lead_status: [
        "contato_feito",
        "negociando",
        "desistiu",
        "fechou",
        "nao_perturbar",
        "transferido",
      ],
      loja_unidade: ["norte", "sul", "shopping"],
      transfer_status: ["pendente", "aceita", "recusada", "cancelada"],
      venda_status: ["pendente", "instalado", "cancelado", "em_analise"],
    },
  },
} as const
