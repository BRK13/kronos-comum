// Gateway único de LLM dos sites do Bruno (F6/BRU-922): endpoint OpenAI-compatível do OpenRouter via fetch nativo, sem SDK.
// Portado de jurimetria/src/lib/llm.ts + llm/roteador.ts, sem banco, sem `@/` e sem tabela de tarefas fixa: cada site
// injeta a sua (`criarClienteLlm`) ou usa só `chat` (modelo + mensagens → string).
//
// Contrato (mesmo do jurimetria, fixado em test/llm.test.mjs com transporte falso):
// - timeout por tentativa (tarefa ou `timeoutMs`); tempo esgotado e rede caída viram ErroLlm transitório;
// - uma retentativa só, em 429, 5xx, 200 com `error.code` numérico >= 500/429, tempo esgotado ou rede; 4xx não repete;
//   `Retry-After` (segundos ou data HTTP) com teto de 10 s; sem ele, 1 s;
// - falha repetível na 2ª tentativa e `failover`: tenta cada modelo seguinte uma vez;
// - cache de prompt: `cache_control: ephemeral` só em modelo `anthropic/` (comCacheAutomatico), lido de
//   usage.prompt_tokens_details.cached_tokens;
// - sem OPENROUTER_API_KEY o módulo carrega; só a chamada falha, com mensagem legível.
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

export type BlocoTexto = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
/** Imagem para modelo multimodal: data URL `data:image/png;base64,...`. */
export type BlocoImagem = { type: "image_url"; image_url: { url: string } };
export type Mensagem = { role: "system" | "user" | "assistant"; content: string | (BlocoTexto | BlocoImagem)[] };
export type Esforco = "low" | "medium" | "high";

/** Bloco fixo (igual entre chamadas), marcado para o cache de prompt. */
export const blocoFixo = (text: string): BlocoTexto => ({ type: "text", text, cache_control: { type: "ephemeral" } });
/** Bloco que muda a cada chamada; vem depois dos fixos. */
export const blocoDinamico = (text: string): BlocoTexto => ({ type: "text", text });

/**
 * Cache automático: em modelo Anthropic, se quem chamou não marcou nenhum bloco, marca só o último system (o mesmo entre
 * chamadas da tarefa). Quem já marca decide sozinho; nos outros modelos a mensagem vai como veio.
 */
export function comCacheAutomatico(modelo: string, mensagens: Mensagem[]): Mensagem[] {
  if (!modelo.startsWith("anthropic/")) return mensagens;
  const marcado = mensagens.some((m) => Array.isArray(m.content) && m.content.some((b) => "cache_control" in b));
  if (marcado) return mensagens;
  const ultimoSystem = mensagens.findLastIndex((m) => m.role === "system");
  return mensagens.map((m, indice) => {
    if (indice !== ultimoSystem) return m;
    if (typeof m.content === "string") return m.content ? { ...m, content: [blocoFixo(m.content)] } : m;
    const ultimo = m.content.findLastIndex((b) => b.type === "text");
    if (ultimo < 0) return m;
    return { ...m, content: m.content.map((b, i) => (i === ultimo ? { ...b, cache_control: { type: "ephemeral" as const } } : b)) };
  });
}

export type ConfigTarefa = {
  modelo: string;
  esforco?: Esforco; // reasoning.effort; ausente = o pedido não leva `reasoning`
  maxTokens?: number; // ausente = MAX_TOKENS_PADRAO
  timeoutMs: number; // por tentativa
  failover?: string[]; // modelos tentados, um a um, depois que o principal falhou duas vezes de forma repetível
};

export type Chamada<T extends string = string> = {
  tarefa: T;
  mensagens: Mensagem[];
  promptVersao?: string;
  promptHash?: string;
  tentativa?: number; // 2 = repetição por saída fora do schema (quem chama decide); sem valor, 1
  pesquisaId?: string;
  decisaoId?: string;
  escritorioId?: string;
  usuarioId?: string;
  formato?: unknown; // response_format, repassado como veio
  maxTokens?: number; // sem valor, o da tarefa
  esforco?: Esforco; // sem valor, o da tarefa
};

export type RespostaLlm = {
  texto: string;
  modelo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  tokensCache?: number | null; // parte da entrada lida do cache de prompt
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

export type ClienteLlm<T extends string = string> = { chamar(c: Chamada<T>): Promise<RespostaLlm> };

// Falha da chamada, com o status HTTP quando houve resposta. `transitorio`: tempo esgotado ou rede caída, sem status.
// `esperaMs`: o que o Retry-After pediu, já com teto.
export class ErroLlm extends Error {
  constructor(message: string, readonly status?: number, readonly esperaMs?: number, readonly transitorio = false) {
    super(message);
    this.name = "ErroLlm";
  }
}

export const ESPERA_PADRAO_MS = 1_000;
export const TETO_ESPERA_MS = 10_000;
// Teto de saída quando nem o chamador nem a tarefa dizem um: nenhuma chamada de chat sai sem max_tokens.
export const MAX_TOKENS_PADRAO = 4000;
export const TIMEOUT_CHAT_PADRAO_MS = 60_000;

export type Dormir = (ms: number) => Promise<void>;
const dormirDeVerdade: Dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry-After em segundos ou em data HTTP, com teto de 10 s. Ausente ou ilegível: undefined (usa a espera padrão). */
export function esperaDoRetryAfter(valor: string | null | undefined, agora = Date.now()): number | undefined {
  if (!valor?.trim()) return undefined;
  const s = Number(valor.trim());
  const ms = Number.isFinite(s) ? s * 1000 : new Date(valor).getTime() - agora;
  if (!Number.isFinite(ms)) return undefined;
  return Math.min(Math.max(ms, 0), TETO_ESPERA_MS);
}

export function repetivel(e: unknown): boolean {
  if (!(e instanceof ErroLlm)) return false;
  return e.transitorio || e.status === 429 || (e.status !== undefined && e.status >= 500);
}

async function comRetentativa<T>(tentar: (tentativaHttp: number) => Promise<T>, dormir: Dormir, esperaPadraoMs = ESPERA_PADRAO_MS): Promise<T> {
  try {
    return await tentar(1);
  } catch (e) {
    if (!repetivel(e)) throw e;
    await dormir((e as ErroLlm).esperaMs ?? esperaPadraoMs);
    return tentar(2);
  }
}

type ErroCorpo = { error?: { message?: string; code?: unknown } };

// fetch com o tempo da tentativa. Tempo esgotado e falha de rede viram ErroLlm transitório; o resto passa como veio.
async function postar(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    // Só corpo que não é JSON vira {}; falha ou tempo esgotado na leitura segue para o tratamento de baixo (retry/failover).
    const corpo = (await res.json().catch((e) => {
      if (e instanceof SyntaxError) return {};
      throw e;
    })) as ErroCorpo;
    return { res, corpo };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    if (nome === "TimeoutError" || nome === "AbortError") {
      throw new ErroLlm(`O modelo não respondeu em ${Math.round(timeoutMs / 1000)} s.`, undefined, undefined, true);
    }
    if (e instanceof TypeError) throw new ErroLlm(`Falha de rede ao chamar o gateway: ${e.message}`, undefined, undefined, true);
    throw e;
  }
}

// Erro HTTP (ou erro no corpo de um 200, que o OpenRouter usa quando o fornecedor falha) com o status e o Retry-After.
function erroHttp(res: Response, corpo: ErroCorpo): ErroLlm {
  const status = res.ok ? (typeof corpo.error?.code === "number" ? corpo.error.code : undefined) : res.status;
  return new ErroLlm(corpo.error?.message ?? `HTTP ${res.status}`, status, esperaDoRetryAfter(res.headers.get("retry-after")));
}

type RespostaOpenRouter = ErroCorpo & {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

type Transporte = { fetchImpl?: typeof fetch; dormir?: Dormir; chave?: () => string | undefined; referer?: string; titulo?: string };

function cabecalhos(chave: string, t: Transporte): Record<string, string> {
  return {
    authorization: `Bearer ${chave}`,
    "content-type": "application/json",
    ...(t.referer ? { "HTTP-Referer": t.referer } : {}),
    ...(t.titulo ? { "X-Title": t.titulo } : {}),
  };
}

const chaveDoAmbiente = () => process.env.OPENROUTER_API_KEY;

type PedidoChat = { modelo: string; mensagens: Mensagem[]; maxTokens: number; esforco?: Esforco; formato?: unknown; timeoutMs: number };

async function enviar(p: PedidoChat, t: Transporte): Promise<RespostaLlm> {
  const chave = (t.chave ?? chaveDoAmbiente)();
  if (!chave) throw new ErroLlm("OPENROUTER_API_KEY não configurada no servidor.");
  const { res, corpo: bruto } = await postar(t.fetchImpl ?? fetch, OPENROUTER_URL, {
    method: "POST",
    headers: cabecalhos(chave, t),
    body: JSON.stringify({
      model: p.modelo,
      messages: comCacheAutomatico(p.modelo, p.mensagens),
      ...(p.maxTokens ? { max_tokens: p.maxTokens } : {}),
      ...(p.esforco ? { reasoning: { effort: p.esforco } } : {}),
      ...(p.formato !== undefined ? { response_format: p.formato } : {}),
      usage: { include: true },
    }),
  }, p.timeoutMs);
  const corpo = bruto as RespostaOpenRouter;
  if (!res.ok || corpo.error) throw erroHttp(res, corpo);
  const escolha = corpo.choices?.[0];
  if (escolha?.finish_reason === "length") throw new ErroLlm("Resposta do modelo cortada por tamanho.");
  if (escolha?.message?.refusal) throw new ErroLlm("O modelo recusou a requisição.");
  const texto = escolha?.message?.content;
  if (!texto) throw new ErroLlm("O modelo devolveu resposta vazia.");
  return {
    texto,
    modelo: corpo.model ?? p.modelo,
    tokensEntrada: corpo.usage?.prompt_tokens ?? null,
    tokensSaida: corpo.usage?.completion_tokens ?? null,
    tokensCache: corpo.usage?.prompt_tokens_details?.cached_tokens ?? null,
    custoUsd: corpo.usage?.cost ?? null,
  };
}

export type OpcoesClienteLlm<T extends string> = Transporte & {
  tarefas: Readonly<Record<T, ConfigTarefa>>;
  /** Toda tentativa (com ou sem sucesso) vira uma linha; falha ao gravar não derruba a chamada. */
  registrar?: (l: LinhaChamada<T>) => Promise<void>;
};

/** Cliente por tarefa (o do jurimetria): o modelo, o esforço, o teto de saída e o tempo vêm da tabela injetada. */
export function criarClienteLlm<T extends string>(op: OpcoesClienteLlm<T>): ClienteLlm<T> {
  const dormir = op.dormir ?? dormirDeVerdade;
  const umaTentativa = async (c: Chamada<T>, cfg: ConfigTarefa, modelo: string): Promise<RespostaLlm> => {
    const inicio = Date.now();
    let r: RespostaLlm | undefined;
    let erro: string | null = null;
    try {
      r = await enviar({
        modelo, mensagens: c.mensagens, maxTokens: c.maxTokens ?? cfg.maxTokens ?? MAX_TOKENS_PADRAO,
        esforco: c.esforco ?? cfg.esforco, formato: c.formato, timeoutMs: cfg.timeoutMs,
      }, op);
      return r;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      await op.registrar?.({
        tarefa: c.tarefa, modelo: r?.modelo ?? modelo, promptVersao: c.promptVersao ?? null,
        promptHash: c.promptHash ?? null, tentativa: c.tentativa ?? 1,
        tokensEntrada: r?.tokensEntrada ?? null, tokensSaida: r?.tokensSaida ?? null, tokensCache: r?.tokensCache ?? null,
        custoUsd: r?.custoUsd ?? null,
        duracaoMs: Date.now() - inicio, pesquisaId: c.pesquisaId ?? null, decisaoId: c.decisaoId ?? null,
        escritorioId: c.escritorioId ?? null, usuarioId: c.usuarioId ?? null, erro,
      }).catch((e) => console.error("llm_chamada não gravada:", e instanceof Error ? e.message : e));
    }
  };
  return {
    async chamar(c) {
      const cfg = op.tarefas[c.tarefa];
      if (!cfg) throw new ErroLlm(`Tarefa de LLM desconhecida: ${c.tarefa}.`);
      try {
        return await comRetentativa(() => umaTentativa(c, cfg, cfg.modelo), dormir);
      } catch (e) {
        if (!repetivel(e) || !cfg.failover?.length) throw e;
        let ultimo: unknown = e;
        for (const alternativo of cfg.failover) {
          try {
            return await umaTentativa(c, cfg, alternativo);
          } catch (e2) {
            ultimo = e2;
            if (!repetivel(e2)) throw e2;
          }
        }
        throw ultimo;
      }
    },
  };
}

export type OpcoesChat = Transporte & {
  timeoutMs?: number; // por tentativa; padrão 60 s
  maxTokens?: number;
  esforco?: Esforco;
  formato?: unknown;
  failover?: string[];
  esperaPadraoMs?: number; // espera sem Retry-After; padrão 1 s
};

/** Atalho dos sites: modelo + mensagens → texto, com timeout padrão, uma retentativa e failover opcional. */
export async function chat(modelo: string, mensagens: Mensagem[], op: OpcoesChat = {}): Promise<string> {
  const dormir = op.dormir ?? dormirDeVerdade;
  const tentar = (m: string) => enviar({
    modelo: m, mensagens, maxTokens: op.maxTokens ?? MAX_TOKENS_PADRAO, esforco: op.esforco, formato: op.formato,
    timeoutMs: op.timeoutMs ?? TIMEOUT_CHAT_PADRAO_MS,
  }, op).then((r) => r.texto);
  try {
    return await comRetentativa(() => tentar(modelo), dormir, op.esperaPadraoMs);
  } catch (e) {
    if (!repetivel(e) || !op.failover?.length) throw e;
    let ultimo: unknown = e;
    for (const alternativo of op.failover) {
      try {
        return await tentar(alternativo);
      } catch (e2) {
        ultimo = e2;
        if (!repetivel(e2)) throw e2;
      }
    }
    throw ultimo;
  }
}

export type OpcoesEmbeddings = Transporte & {
  modelo: string;
  timeoutMs?: number; // padrão 15 s
  dimensoes?: number; // padrão 768
  maxCaracteres?: number; // corte por texto antes do envio; padrão 8000 (o do jurimetria); Infinity não corta
  registrar?: (l: LinhaChamada<"embedding">) => Promise<void>;
};

type RespostaEmbeddings = ErroCorpo & {
  model?: string;
  data?: { embedding?: number[]; index?: number }[];
  usage?: { prompt_tokens?: number; cost?: number };
};

/** Vários textos numa chamada só: devolve os vetores na ordem dos textos. Lista vazia não chama nada. */
export function criarEmbeddings(op: OpcoesEmbeddings): (textos: readonly string[], ref?: { pesquisaId?: string }) => Promise<number[][]> {
  const dormir = op.dormir ?? dormirDeVerdade;
  const dimensoes = op.dimensoes ?? 768;
  const maxCaracteres = op.maxCaracteres ?? 8000;
  const umaTentativa = async (textos: readonly string[], ref: { pesquisaId?: string }): Promise<number[][]> => {
    const inicio = Date.now();
    let corpo: RespostaEmbeddings = {};
    let erro: string | null = null;
    try {
      const chave = (op.chave ?? chaveDoAmbiente)();
      if (!chave) throw new ErroLlm("OPENROUTER_API_KEY não configurada no servidor.");
      const r = await postar(op.fetchImpl ?? fetch, OPENROUTER_EMBEDDINGS_URL, {
        method: "POST",
        headers: cabecalhos(chave, op),
        body: JSON.stringify({ model: op.modelo, input: textos.map((t) => t.slice(0, maxCaracteres)), dimensions: dimensoes }),
      }, op.timeoutMs ?? 15_000);
      corpo = r.corpo as RespostaEmbeddings;
      if (!r.res.ok || corpo.error) throw erroHttp(r.res, corpo);
      // O contrato OpenAI traz `index` em cada item; sem ele, vale a ordem da lista.
      const vetores = (corpo.data ?? [])
        .map((d, i) => ({ i: d.index ?? i, v: d.embedding }))
        .sort((x, y) => x.i - y.i)
        .map((d) => d.v);
      if (vetores.length !== textos.length) throw new ErroLlm(`${vetores.length} vetores para ${textos.length} textos.`);
      for (const v of vetores) {
        if (!v || v.length !== dimensoes) throw new ErroLlm(`Embedding com ${v?.length ?? 0} dimensões; esperava ${dimensoes}.`);
      }
      return vetores as number[][];
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      await op.registrar?.({
        tarefa: "embedding", modelo: corpo.model ?? op.modelo, promptVersao: null,
        tokensEntrada: corpo.usage?.prompt_tokens ?? null, tokensSaida: 0, custoUsd: corpo.usage?.cost ?? null,
        duracaoMs: Date.now() - inicio, pesquisaId: ref.pesquisaId ?? null, decisaoId: null, erro,
      }).catch((e) => console.error("llm_chamada não gravada:", e instanceof Error ? e.message : e));
    }
  };
  return async (textos, ref = {}) => (textos.length === 0 ? [] : comRetentativa(() => umaTentativa(textos, ref), dormir));
}
