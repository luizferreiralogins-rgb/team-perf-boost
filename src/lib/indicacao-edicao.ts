/** Uma alteração comum não deve recriar a indicação de uma venda existente. */
export function precisaRegistrarIndicador(editingId: string | undefined, canalInicial: string | undefined, canalAtual: string) {
  return /indique/i.test(canalAtual) && (!editingId || !/indique/i.test(canalInicial ?? ""));
}