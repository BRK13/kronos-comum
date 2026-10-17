// Consulta o Resend (GET /emails, paginado) e devolve os destinatários com bounce/reclamação/falha. Único no lugar dos
// 9 sync-bounces.mjs (5 variantes). Cada blast marca o seu CSV com o Map devolvido.
const API = "https://api.resend.com";
export const EVENTOS_RUINS = new Set(["bounced", "complained", "failed"]);

/** @returns {Promise<{ruins: Map<string,{event:string,id:string,created_at:string}>, total:number, paginas:number}>} */
export async function coletarBounces({ chave = process.env.RESEND_API_KEY, fetchImpl = fetch } = {}) {
  if (!chave) throw new Error("RESEND_API_KEY ausente");
  const ruins = new Map();
  let cursor = null, paginas = 0, total = 0;
  for (;;) {
    paginas++;
    const url = new URL(`${API}/emails`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Resend API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const itens = data.data || [];
    total += itens.length;
    for (const item of itens) {
      if (!EVENTOS_RUINS.has(item.last_event)) continue;
      for (const to of item.to || []) {
        const email = String(to).toLowerCase().trim();
        if (!ruins.has(email)) ruins.set(email, { event: item.last_event, id: item.id, created_at: item.created_at });
      }
    }
    if (!data.has_more) break;
    cursor = itens.at(-1)?.id;
    if (!cursor) break;
  }
  return { ruins, total, paginas };
}

/** Marca como "bounced" as linhas (com .email, .status) que estão em `ruins`; devolve as linhas alteradas. */
export function marcarBounces(linhas, ruins) {
  const alteradas = [];
  for (const r of linhas) {
    const ruim = ruins.get(r.email);
    if (!ruim || r.status === "bounced" || r.status === "unsubscribed") continue;
    r.status = "bounced";
    alteradas.push({ linha: r, ruim });
  }
  return alteradas;
}
