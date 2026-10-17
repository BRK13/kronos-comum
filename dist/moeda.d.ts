export type Unidade = "centavos" | "reais";
/** "R$ 12,34" (espaço comum no lugar do NBSP do Intl, para comparar e copiar sem surpresa). */
export declare function formatarBRL(valor: number, unidade: Unidade): string;
export declare const reaisParaCentavos: (reais: number) => number;
export declare const centavosParaReais: (centavos: number) => number;
