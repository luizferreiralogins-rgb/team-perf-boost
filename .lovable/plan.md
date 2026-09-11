# Área de Relatórios

## Objetivo
Adicionar **Relatórios** ao menu lateral e criar uma área onde cada pessoa escolhe o relatório, configura filtros e consulta apenas dados autorizados pela hierarquia.

## O que será criado
- Novo item **Relatórios** no menu principal, disponível para todos os perfis autenticados.
- Página inicial com dois tipos de relatório:
  1. **Vendas com reagendamentos** — protocolo, cliente, vendedor, canal, datas anterior e nova, motivo, responsável pelo registro e data/hora; quando uma venda tiver vários reagendamentos, todo o histórico será exibido.
  2. **Vendas por canal de vendas** — agrupamento dos resultados por canal, com quantidade de vendas, receita, comissão e participação percentual, além da relação detalhada das vendas.
- Filtros por período, vendedor e Loja/PAP; gestores também poderão filtrar os membros dentro do seu próprio alcance.
- Estados de carregamento, relatório vazio e tabelas adaptadas para telas menores.

## Regras de acesso
- **Consultor:** somente suas próprias vendas e registros.
- **Gerente e Líder PAP:** somente consultores da própria equipe.
- **Regional, Regional Master e Administrador:** somente pessoas alcançadas pela hierarquia já configurada no sistema.
- A interface reutilizará o mecanismo atual de equipe e as regras de acesso do banco, sem ampliar permissões.

## Detalhes técnicos
- Criar a rota autenticada `/relatorios`, com metadados próprios.
- Reutilizar `useEquipe` e os filtros hierárquicos já usados na Dashboard e na Relação de Vendas.
- Consultar `vendas_loja`, `vendas_pap`, `agendamento_historico` e `profiles`, sempre restringindo os vendedores ao escopo calculado para o usuário.
- Adicionar o link tipado no menu lateral e permitir abrir a venda pelo seu identificador quando aplicável.
- Validar compilação e conferir a página no preview em desktop e no tamanho atual da tela.
