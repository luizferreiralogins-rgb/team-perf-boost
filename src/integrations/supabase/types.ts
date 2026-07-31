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
      agendamento_historico: {
        Row: {
          created_at: string
          criado_por: string
          data_anterior: string | null
          data_nova: string | null
          id: string
          motivo: string
          tabela: string
          venda_id: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          criado_por: string
          data_anterior?: string | null
          data_nova?: string | null
          id?: string
          motivo: string
          tabela: string
          venda_id: string
          vendedor_id: string
        }
        Update: {
          created_at?: string
          criado_por?: string
          data_anterior?: string | null
          data_nova?: string | null
          id?: string
          motivo?: string
          tabela?: string
          venda_id?: string
          vendedor_id?: string
        }
        Relationships: []
      }
      atalhos_externos: {
        Row: {
          chave: string
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
          url: string | null
        }
        Insert: {
          chave: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          chave?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      atendimentos: {
        Row: {
          contato_cliente: string | null
          created_at: string
          data_atendimento: string
          id: string
          nome_cliente: string
          observacoes: string | null
          tipo: Database["public"]["Enums"]["tipo_atendimento"]
          updated_at: string
          usuario_id: string
        }
        Insert: {
          contato_cliente?: string | null
          created_at?: string
          data_atendimento?: string
          id?: string
          nome_cliente: string
          observacoes?: string | null
          tipo: Database["public"]["Enums"]["tipo_atendimento"]
          updated_at?: string
          usuario_id: string
        }
        Update: {
          contato_cliente?: string | null
          created_at?: string
          data_atendimento?: string
          id?: string
          nome_cliente?: string
          observacoes?: string | null
          tipo?: Database["public"]["Enums"]["tipo_atendimento"]
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      contestacao_importacoes: {
        Row: {
          arquivo_nome: string
          canal: Database["public"]["Enums"]["canal_venda"]
          created_at: string
          criado_por: string
          id: string
          mes_ref: string
          total_linhas: number
        }
        Insert: {
          arquivo_nome: string
          canal: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          criado_por: string
          id?: string
          mes_ref: string
          total_linhas?: number
        }
        Update: {
          arquivo_nome?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          criado_por?: string
          id?: string
          mes_ref?: string
          total_linhas?: number
        }
        Relationships: []
      }
      contestacao_vendas_nativas: {
        Row: {
          canal: Database["public"]["Enums"]["canal_venda"]
          consultor_nome: string | null
          cpf_cnpj: string | null
          created_at: string
          data_instalacao: string | null
          id: string
          importacao_id: string
          mes_ref: string
          nome_cliente: string
          protocolo: string | null
          valor: number
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal_venda"]
          consultor_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_instalacao?: string | null
          id?: string
          importacao_id: string
          mes_ref: string
          nome_cliente: string
          protocolo?: string | null
          valor?: number
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_venda"]
          consultor_nome?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_instalacao?: string | null
          id?: string
          importacao_id?: string
          mes_ref?: string
          nome_cliente?: string
          protocolo?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contestacao_vendas_nativas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "contestacao_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contatos: {
        Row: {
          created_at: string
          etapa: number
          id: string
          lead_id: string
          observacao: string
          prazo_dias_uteis: number
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          etapa: number
          id?: string
          lead_id: string
          observacao: string
          prazo_dias_uteis: number
          vendedor_id: string
        }
        Update: {
          created_at?: string
          etapa?: number
          id?: string
          lead_id?: string
          observacao?: string
          prazo_dias_uteis?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
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
          etapa_contato: number
          fonte: string | null
          id: string
          latitude: number | null
          localizacao: string | null
          longitude: number | null
          nome: string
          observacoes: string | null
          produto_interesse: string | null
          proximo_contato_em: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          vendedor_id: string
          whatsapp: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          email?: string | null
          etapa_contato?: number
          fonte?: string | null
          id?: string
          latitude?: number | null
          localizacao?: string | null
          longitude?: number | null
          nome: string
          observacoes?: string | null
          produto_interesse?: string | null
          proximo_contato_em?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          vendedor_id: string
          whatsapp?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string
          email?: string | null
          etapa_contato?: number
          fonte?: string | null
          id?: string
          latitude?: number | null
          localizacao?: string | null
          longitude?: number | null
          nome?: string
          observacoes?: string | null
          produto_interesse?: string | null
          proximo_contato_em?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          vendedor_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      mensagens_chat: {
        Row: {
          created_at: string
          destinatario_id: string
          id: string
          lida: boolean
          remetente_id: string
          texto: string
        }
        Insert: {
          created_at?: string
          destinatario_id: string
          id?: string
          lida?: boolean
          remetente_id: string
          texto: string
        }
        Update: {
          created_at?: string
          destinatario_id?: string
          id?: string
          lida?: boolean
          remetente_id?: string
          texto?: string
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
      parametros_pap_novos_produtos: {
        Row: {
          codigo: string
          limitado: boolean
          limite: number
          nome: string
          percentual: number
        }
        Insert: {
          codigo: string
          limitado?: boolean
          limite?: number
          nome: string
          percentual?: number
        }
        Update: {
          codigo?: string
          limitado?: boolean
          limite?: number
          nome?: string
          percentual?: number
        }
        Relationships: []
      }
      parametros_versoes: {
        Row: {
          aplicado_por: string
          canal: Database["public"]["Enums"]["canal_venda"]
          created_at: string
          fontes: string
          id: string
          resumo: string
          snapshot: Json
          vigencia_inicio: string
        }
        Insert: {
          aplicado_por: string
          canal: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          fontes?: string
          id?: string
          resumo?: string
          snapshot: Json
          vigencia_inicio?: string
        }
        Update: {
          aplicado_por?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          fontes?: string
          id?: string
          resumo?: string
          snapshot?: Json
          vigencia_inicio?: string
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
      tarefas: {
        Row: {
          alvo: Database["public"]["Enums"]["tarefa_alvo"]
          cliente_contato: string | null
          cliente_nome: string | null
          created_at: string
          criador_id: string
          data_venc: string
          descricao: string | null
          hora_venc: string | null
          id: string
          prioridade: Database["public"]["Enums"]["tarefa_prioridade"]
          responsavel_id: string | null
          status: Database["public"]["Enums"]["tarefa_status"]
          titulo: string
          updated_at: string
        }
        Insert: {
          alvo?: Database["public"]["Enums"]["tarefa_alvo"]
          cliente_contato?: string | null
          cliente_nome?: string | null
          created_at?: string
          criador_id: string
          data_venc?: string
          descricao?: string | null
          hora_venc?: string | null
          id?: string
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          titulo: string
          updated_at?: string
        }
        Update: {
          alvo?: Database["public"]["Enums"]["tarefa_alvo"]
          cliente_contato?: string | null
          cliente_nome?: string | null
          created_at?: string
          criador_id?: string
          data_venc?: string
          descricao?: string | null
          hora_venc?: string | null
          id?: string
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          titulo?: string
          updated_at?: string
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
          agendamento_adiamentos: number
          classe_protocolo: string | null
          comissao: number
          contem_movel: boolean
          cpf_cnpj: string | null
          created_at: string
          data_abertura: string | null
          data_agendamento: string | null
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
          agendamento_adiamentos?: number
          classe_protocolo?: string | null
          comissao?: number
          contem_movel?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          data_abertura?: string | null
          data_agendamento?: string | null
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
          agendamento_adiamentos?: number
          classe_protocolo?: string | null
          comissao?: number
          contem_movel?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          data_abertura?: string | null
          data_agendamento?: string | null
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
          agendamento_adiamentos: number
          bairro: string | null
          cidade: string | null
          comissao: number
          cpf_cnpj: string | null
          created_at: string
          data_agendamento: string | null
          data_ativacao: string | null
          data_venda: string
          endereco: string | null
          id: string
          mes_ref: string
          nome_cliente: string
          observacoes: string | null
          produto: string | null
          protocolo: string | null
          qtd_linhas: number
          status: Database["public"]["Enums"]["venda_status"]
          tecnologia: string | null
          telefone: string | null
          tipo_protocolo: string | null
          updated_at: string
          valor: number
          vendedor_id: string
        }
        Insert: {
          agendamento_adiamentos?: number
          bairro?: string | null
          cidade?: string | null
          comissao?: number
          cpf_cnpj?: string | null
          created_at?: string
          data_agendamento?: string | null
          data_ativacao?: string | null
          data_venda?: string
          endereco?: string | null
          id?: string
          mes_ref?: string
          nome_cliente: string
          observacoes?: string | null
          produto?: string | null
          protocolo?: string | null
          qtd_linhas?: number
          status?: Database["public"]["Enums"]["venda_status"]
          tecnologia?: string | null
          telefone?: string | null
          tipo_protocolo?: string | null
          updated_at?: string
          valor?: number
          vendedor_id: string
        }
        Update: {
          agendamento_adiamentos?: number
          bairro?: string | null
          cidade?: string | null
          comissao?: number
          cpf_cnpj?: string | null
          created_at?: string
          data_agendamento?: string | null
          data_ativacao?: string | null
          data_venda?: string
          endereco?: string | null
          id?: string
          mes_ref?: string
          nome_cliente?: string
          observacoes?: string | null
          produto?: string | null
          protocolo?: string | null
          qtd_linhas?: number
          status?: Database["public"]["Enums"]["venda_status"]
          tecnologia?: string | null
          telefone?: string | null
          tipo_protocolo?: string | null
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
      add_dias_uteis: {
        Args: { _base: string; _dias: number }
        Returns: string
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
      consultor_ve_nativa: {
        Args: { _consultor_nome: string }
        Returns: boolean
      }
      expirar_leads_sem_contato: { Args: never; Returns: number }
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
      is_gestor_regras: { Args: { _uid: string }; Returns: boolean }
      listar_destinatarios_venda: {
        Args: never
        Returns: {
          canal: Database["public"]["Enums"]["canal_venda"]
          id: string
          nome: string
        }[]
      }
      listar_usuarios_tarefas: {
        Args: never
        Returns: {
          id: string
          nome: string
        }[]
      }
      nome_chave: { Args: { _t: string }; Returns: string }
      pode_gerenciar: {
        Args: { _manager: string; _target: string }
        Returns: boolean
      }
      transferir_venda: {
        Args: { _para: string; _tabela: string; _venda_id: string }
        Returns: undefined
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
      tarefa_alvo: "propria" | "usuario" | "cliente"
      tarefa_prioridade: "baixa" | "media" | "alta"
      tarefa_status: "pendente" | "concluida" | "cancelada" | "iniciada"
      tipo_atendimento:
        | "pagamento"
        | "boleto"
        | "suporte"
        | "cancelamento"
        | "duvida"
        | "entrega_equipamento"
        | "reclamacao"
        | "ativacao_configuracao"
        | "retirada_chip"
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
      tarefa_alvo: ["propria", "usuario", "cliente"],
      tarefa_prioridade: ["baixa", "media", "alta"],
      tarefa_status: ["pendente", "concluida", "cancelada", "iniciada"],
      tipo_atendimento: [
        "pagamento",
        "boleto",
        "suporte",
        "cancelamento",
        "duvida",
        "entrega_equipamento",
        "reclamacao",
        "ativacao_configuracao",
        "retirada_chip",
      ],
      transfer_status: ["pendente", "aceita", "recusada", "cancelada"],
      venda_status: ["pendente", "instalado", "cancelado", "em_analise"],
    },
  },
} as const
