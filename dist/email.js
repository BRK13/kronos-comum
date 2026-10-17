// Envio pelo Resend, único para os sites: fetch direto em https://api.resend.com/emails, sem SDK, com tempo máximo e
// Idempotency-Key (o Resend ignora a repetição da mesma chave por 24 h). Nunca lança: devolve o que houve e quem chama
// decide. Base: jurimetria/src/lib/email/resend.ts, com `to` string ou lista, anexos e reply_to do acta.
export const API_RESEND = "https://api.resend.com/emails";
/** Monta o corpo exato enviado ao Resend (exportado para os testes de caracterização dos sites). */
export function montarCarga(e) {
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
export async function enviar(e, o = {}) {
    const carga = montarCarga(e);
    if (carga.to.length === 0)
        return { ok: false, status: 0, erro: "sem destinatário" };
    const chave = (o.chave ?? process.env.RESEND_API_KEY)?.trim();
    if (!chave)
        return { ok: false, status: 0, erro: "RESEND_API_KEY não configurada" };
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
        const corpo = (await r.json().catch(() => ({})));
        if (r.ok && corpo.id)
            return { ok: true, id: corpo.id };
        const espera = Number(r.headers?.get?.("retry-after"));
        return {
            ok: false,
            status: r.status,
            erro: (corpo.message ?? corpo.name ?? `HTTP ${r.status}`).slice(0, 500),
            ...(Number.isFinite(espera) && espera > 0 ? { esperarS: espera } : {}),
        };
    }
    catch (err) {
        return { ok: false, status: 0, erro: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
    }
}
