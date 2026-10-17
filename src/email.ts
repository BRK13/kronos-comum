// Envio pelo Resend, único para os sites: fetch direto em https://api.resend.com/emails, sem SDK, com tempo máximo e
// Idempotency-Key (o Resend ignora a repetição da mesma chave por 24 h). Nunca lança: devolve o que houve e quem chama
// decide. Base: jurimetria/src/lib/email/resend.ts, com `to` string ou lista, anexos e reply_to do acta.

export type Anexo = { filename: string; content: string; content_type?: string }; // content em base64

export type Carga = {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  attachments?: Anexo[];
};

export type Resposta =
  | { ok: true; id: string }
  | { ok: false; status: number; erro: string; esperarS?: number }; // status 0 = rede, tempo esgotado ou sem chave

export type Envio = {
  de: string;
  para: string | string[];
  assunto: string;
  html?: string;
  texto?: string;
  responderPara?: string;
  anexos?: Anexo[];
  tags?: { name: string; value: string }[];
  cabecalhos?: Record<string, string>;
  idempotencia?: string;
};

export type Opcoes = {
  chave?: string; // padrão: RESEND_API_KEY
  timeoutMs?: number; // padrão: 15 s
  fetchImpl?: typeof fetch;
};

export const API_RESEND = "https://api.resend.com/emails";

/** Monta o corpo exato enviado ao Resend (exportado para os testes de caracterização dos sites). */
export function montarCarga(e: Envio): Carga {
  const to = (Array.isArray(e.para) ? e.para : [e.para]).filter(Boolean);
  return {
    from: e.de,
    to,
    subject: e.assunto,
    ...(e.html !== undefined ? { html: e.html } : {}),
    ...(e.texto !== undefined ? { text: e.texto } : {}),
    ...(e.responderPara ? { reply_to: e.responderPara } : {}),
    ...(e.cabecalhos ? { headers: e.cabecalhos } : {}),
    ...(e.tags?.length ? { tags: e.tags } : {}),
    ...(e.anexos?.length ? { attachments: e.anexos } : {}),
  };
}

export async function enviar(e: Envio, o: Opcoes = {}): Promise<Resposta> {
  const carga = montarCarga(e);
  if (carga.to.length === 0) return { ok: false, status: 0, erro: "sem destinatário" };
  const chave = (o.chave ?? process.env.RESEND_API_KEY)?.trim();
  if (!chave) return { ok: false, status: 0, erro: "RESEND_API_KEY não configurada" };
  try {
    const r = await (o.fetchImpl ?? fetch)(API_RESEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        ...(e.idempotencia ? { "Idempotency-Key": e.idempotencia.slice(0, 256) } : {}),
      },
      body: JSON.stringify(carga),
      signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
    });
    const corpo = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (r.ok && corpo.id) return { ok: true, id: corpo.id };
    const espera = Number(r.headers?.get?.("retry-after"));
    return {
      ok: false,
      status: r.status,
      erro: (corpo.message ?? corpo.name ?? `HTTP ${r.status}`).slice(0, 500),
      ...(Number.isFinite(espera) && espera > 0 ? { esperarS: espera } : {}),
    };
  } catch (err) {
    return { ok: false, status: 0, erro: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
}
