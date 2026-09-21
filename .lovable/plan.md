# Pós‑vendas

Novo item no menu lateral, **Pós‑vendas**, onde cada consultor acompanha as próprias vendas ativadas e registra os contatos de acompanhamento. Gerentes, líderes e regionais veem as vendas da equipe conforme a hierarquia já usada nas outras telas.

## Como funciona

Toda venda com data de ativação entra automaticamente na régua:

1. **Satisfação — 10 dias após a ativação.** Pergunta registrada: "Como está sendo a experiência até o momento?" Botões: Neutro, Sem resposta, Satisfeito, Suporte solicitado, Insatisfeito. Em Insatisfeito o motivo é obrigatório.
2. **Novos produtos — 20 dias após o contato de satisfação**, apenas quando o resultado foi Satisfeito. Pergunta: "Quais outros produtos podem ser ofertados?" Em cada produto marca‑se se o cliente **já tem** e se **foi ofertado**: Banda Larga (com campo de velocidade), Móvel (quantidade de linhas), TV, Telemedicina, Câmeras, Ponto adicional mesh. Campo livre de observação.

Sem resposta, Neutro, Suporte solicitado ou Insatisfeito encerram a régua daquela venda (ficam como "Sem oferta"), e o histórico permanece visível.

## Tela

- Cartões de resumo no topo: Satisfação em dia, Satisfação atrasada, Novos produtos em dia, Novos produtos atrasados, Concluídos.
- Filtros: fase (Satisfação / Novos produtos / Concluído), situação (Em dia / Atrasado / Todos), consultor e unidade (mesma barra de filtros por hierarquia já usada em Relatórios) e busca por cliente ou protocolo.
- Lista com cliente, protocolo, canal, consultor, data de ativação, prazo do contato com destaque vermelho quando atrasado, e botão "Registrar contato" que abre o formulário da fase correspondente.
- Cada linha pode ser expandida para ver o histórico de contatos já registrados.

## Detalhes técnicos

- Nova tabela `pos_venda_contatos`: `id`, `tabela` (`vendas_loja` | `vendas_pap`), `venda_id`, `vendedor_id`, `fase` (`satisfacao` | `produtos`), `resultado` (neutro | sem_resposta | satisfeito | suporte | insatisfeito), `motivo`, `produtos` jsonb (contratados/ofertados, velocidade, qtd de linhas), `observacao`, `criado_por`, `created_at`. GRANTs para `authenticated`/`service_role`, RLS com leitura/escrita para o dono da venda e para gestores via `is_gestor_de(auth.uid(), vendedor_id)`; sem UPDATE/DELETE (histórico imutável).
- Nova rota `src/routes/_authenticated/pos-vendas.tsx` com `head()` próprio; item no menu em `src/components/app-shell.tsx` (ícone `HeartHandshake`), visível para todos os perfis.
- Fonte das vendas: `vendas_loja` e `vendas_pap` com `status = 'instalado'` e `data_ativacao` preenchida, respeitando RLS; filtros por hierarquia reaproveitam `useEquipe`/`aplicarFiltros`/`FiltrosBar` de `filtros-ranking`.
- As fases e os prazos são calculados no cliente a partir de `data_ativacao` e dos registros existentes em `pos_venda_contatos` (10 e 20 dias corridos).
- Componentes de formulário em `src/components/pos-vendas/` (diálogo de satisfação e diálogo de novos produtos).
