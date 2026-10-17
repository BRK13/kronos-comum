// Dinheiro com a unidade explícita: um erro de reais × centavos imprime valor 100x errado.
// Base: acta-control/lib/money.ts (instância Intl reaproveitada, NaN vira zero).

export type Unidade = "centavos" | "reais";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 12,34" (espaço comum no lugar do NBSP do Intl, para comparar e copiar sem surpresa). */
export function formatarBRL(valor: number, unidade: Unidade): string {
  if (unidade !== "centavos" && unidade !== "reais") throw new TypeError(`unidade inválida: ${String(unidade)}`);
  const reais = unidade === "centavos" ? valor / 100 : valor;
  return brl.format(Number.isFinite(reais) ? reais : 0).replace(/ /g, " ");
}

export const reaisParaCentavos = (reais: number): number => Math.round(reais * 100);
export const centavosParaReais = (centavos: number): number => centavos / 100;
