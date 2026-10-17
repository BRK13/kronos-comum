export declare const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export declare const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
export type BlocoTexto = {
    type: "text";
    text: string;
    cache_control?: {
        type: "ephemeral";
    };
};
/** Imagem para modelo multimodal: data URL `data:image/png;base64,...`. */
export type BlocoImagem = {
    type: "image_url";
    image_url: {
        url: string;
    };
};
export type Mensagem = {
    role: "system" | "user" | "assistant";
    content: string | (BlocoTexto | BlocoImagem)[];
};
export type Esforco = "low" | "medium" | "high";
/** Bloco fixo (igual entre chamadas), marcado para o cache de prompt. */
export declare const blocoFixo: (text: string) => BlocoTexto;
/** Bloco que muda a cada chamada; vem depois dos fixos. */
export declare const blocoDinamico: (text: string) => BlocoTexto;
/**
 * Cache automático: em modelo Anthropic, se quem chamou não marcou nenhum bloco, marca só o último system (o mesmo entre
 * chamadas da tarefa). Quem já marca decide sozinho; nos outros modelos a mensagem vai como veio.
 */
export declare function comCacheAutomatico(modelo: string, mensagens: Mensagem[]): Mensagem[];
export type ConfigTarefa = {
    modelo: string;
    esforco?: Esforco;
    maxTokens?: number;
    timeoutMs: number;
    failover?: string[];
};
export type Chamada<T extends string = string> = {
    tarefa: T;
    mensagens: Mensagem[];
    promptVersao?: string;
    promptHash?: string;
    tentativa?: number;
    pesquisaId?: string;
    decisaoId?: string;
    escritorioId?: string;
    usuarioId?: string;
    formato?: unknown;
    maxTokens?: number;
    esforco?: Esforco;
};
export type RespostaLlm = {
    texto: string;
    modelo: string;
    tokensEntrada: number | null;
    tokensSaida: number | null;
    tokensCache?: number | null;
    custoUsd: number | null;
};
export type LinhaChamada<T extends string = string> = {
    tarefa: T;
    modelo: string;
    promptVersao: string | null;
    promptHash?: string | null;
    tentativa?: number;
    tokensEntrada: number | null;
    tokensSaida: number | null;
    tokensCache?: number | null;
    custoUsd: number | null;
    duracaoMs: number;
    pesquisaId: string | null;
    decisaoId: string | null;
    escritorioId?: string | null;
    usuarioId?: string | null;
    erro: string | null;
};
export type ClienteLlm<T extends string = string> = {
    chamar(c: Chamada<T>): Promise<RespostaLlm>;
};
export declare class ErroLlm extends Error {
    readonly status?: number | undefined;
    readonly esperaMs?: number | undefined;
    readonly transitorio: boolean;
    constructor(message: string, status?: number | undefined, esperaMs?: number | undefined, transitorio?: boolean);
}
export declare const ESPERA_PADRAO_MS = 1000;
export declare const TETO_ESPERA_MS = 10000;
export declare const MAX_TOKENS_PADRAO = 4000;
export declare const TIMEOUT_CHAT_PADRAO_MS = 60000;
export type Dormir = (ms: number) => Promise<void>;
/** Retry-After em segundos ou em data HTTP, com teto de 10 s. Ausente ou ilegível: undefined (usa a espera padrão). */
export declare function esperaDoRetryAfter(valor: string | null | undefined, agora?: number): number | undefined;
export declare function repetivel(e: unknown): boolean;
type Transporte = {
    fetchImpl?: typeof fetch;
    dormir?: Dormir;
    chave?: () => string | undefined;
    referer?: string;
    titulo?: string;
};
export type OpcoesClienteLlm<T extends string> = Transporte & {
    tarefas: Readonly<Record<T, ConfigTarefa>>;
    /** Toda tentativa (com ou sem sucesso) vira uma linha; falha ao gravar não derruba a chamada. */
    registrar?: (l: LinhaChamada<T>) => Promise<void>;
};
/** Cliente por tarefa (o do jurimetria): o modelo, o esforço, o teto de saída e o tempo vêm da tabela injetada. */
export declare function criarClienteLlm<T extends string>(op: OpcoesClienteLlm<T>): ClienteLlm<T>;
export type OpcoesChat = Transporte & {
    timeoutMs?: number;
    maxTokens?: number;
    esforco?: Esforco;
    formato?: unknown;
    failover?: string[];
    esperaPadraoMs?: number;
};
/** Atalho dos sites: modelo + mensagens → texto, com timeout padrão, uma retentativa e failover opcional. */
export declare function chat(modelo: string, mensagens: Mensagem[], op?: OpcoesChat): Promise<string>;
export type OpcoesEmbeddings = Transporte & {
    modelo: string;
    timeoutMs?: number;
    dimensoes?: number;
    maxCaracteres?: number;
    registrar?: (l: LinhaChamada<"embedding">) => Promise<void>;
};
/** Vários textos numa chamada só: devolve os vetores na ordem dos textos. Lista vazia não chama nada. */
export declare function criarEmbeddings(op: OpcoesEmbeddings): (textos: readonly string[], ref?: {
    pesquisaId?: string;
}) => Promise<number[][]>;
export {};
