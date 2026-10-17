export type Ruim = { event: string; id: string; created_at: string };
export const EVENTOS_RUINS: Set<string>;
export function coletarBounces(o?: { chave?: string; fetchImpl?: typeof fetch }): Promise<{ ruins: Map<string, Ruim>; total: number; paginas: number }>;
export function marcarBounces<T extends { email: string; status: string }>(linhas: T[], ruins: Map<string, Ruim>): { linha: T; ruim: Ruim }[];
