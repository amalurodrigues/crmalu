/**
 * Tipos de anotação do operador sobre o cliente.
 *
 * Arquivo separado das actions porque um módulo "use server" só pode exportar
 * funções async — constantes e tipos precisam morar fora para serem
 * importáveis tanto pelo servidor quanto pela página.
 */
export const NOTE_KINDS = ["historico", "estrategia", "ideia", "nota"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_SECTIONS: Array<{
  kind: NoteKind;
  label: string;
  hint: string;
  placeholder: string;
  /** anotação datada faz sentido? histórico sim, ideia solta não */
  dated: boolean;
}> = [
  {
    kind: "historico",
    label: "Histórico de trabalho",
    hint: "O que já foi feito e quando. É isto que vira o bloco “o que foi feito” do relatório (docs/05) — sem ele o relatório vira boletim meteorológico.",
    placeholder: "Pausei o Estático02, subi 20% no conjunto de Maternidade…",
    dated: true,
  },
  {
    kind: "estrategia",
    label: "Estratégias em curso",
    hint: "A tese que está sendo testada agora, para o relatório poder dizer por que uma coisa foi feita.",
    placeholder: "Testar vídeo contra estático no público frio…",
    dated: false,
  },
  {
    kind: "ideia",
    label: "Ideias futuras",
    hint: "O que fazer no próximo período. Alimenta o bloco “o que vem a seguir”.",
    placeholder: "Separar conjunto por faixa etária quando houver volume…",
    dated: false,
  },
  {
    kind: "nota",
    label: "Notas",
    hint: "Contexto solto sobre a conta. Não gravar aqui dado pessoal de lead (docs/07).",
    placeholder: "Cliente só aprova criativo às segundas…",
    dated: false,
  },
];
