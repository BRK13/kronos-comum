export type Anexo = {
    filename: string;
    content: string;
    content_type?: string;
};
export type Carga = {
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    reply_to?: string;
    headers?: Record<string, string>;
    tags?: {
        name: string;
        value: string;
    }[];
    attachments?: Anexo[];
};
export type Resposta = {
    ok: true;
    id: string;
} | {
    ok: false;
    status: number;
    erro: string;
    esperarS?: number;
};
export type Envio = {
    de: string;
    para: string | string[];
    assunto: string;
    html?: string;
    texto?: string;
    responderPara?: string;
    anexos?: Anexo[];
    tags?: {
        name: string;
        value: string;
    }[];
    cabecalhos?: Record<string, string>;
    idempotencia?: string;
};
export type Opcoes = {
    chave?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
};
export declare const API_RESEND = "https://api.resend.com/emails";
/** Monta o corpo exato enviado ao Resend (exportado para os testes de caracterização dos sites). */
export declare function montarCarga(e: Envio): Carga;
export declare function enviar(e: Envio, o?: Opcoes): Promise<Resposta>;
