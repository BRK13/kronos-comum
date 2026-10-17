export function parseEnv(texto: string): Record<string, string>;
export function loadEnv(caminho: string, opcoes?: { override?: boolean; env?: Record<string, string | undefined> }): string[];
export function lerChave(caminho: string, nome: string): string | undefined;
