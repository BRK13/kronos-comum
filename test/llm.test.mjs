import test from "node:test";
import assert from "node:assert/strict";
import {
  chat, criarClienteLlm, criarEmbeddings, comCacheAutomatico, blocoFixo, esperaDoRetryAfter, repetivel, ErroLlm,
  OPENROUTER_URL,
} from "../dist/llm.js";

const ok = (texto, extra = {}) => ({ model: "m", choices: [{ finish_reason: "stop", message: { content: texto } }], ...extra });
const resp = (status, corpo, headers = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...headers } });

// Transporte falso: devolve as respostas em ordem (Error = rejeita) e grava url/corpo/signal de cada chamada.
function falso(...respostas) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, corpo: JSON.parse(init.body), headers: init.headers, signal: init.signal });
    const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
    if (r instanceof Error) throw r;
    return r instanceof Response ? r.clone() : r;
  };
  const esperas = [];
  return { fetchImpl, chamadas, esperas, dormir: async (ms) => { esperas.push(ms); }, chave: () => "k" };
}
const U = [{ role: "user", content: "oi" }];
const TAREFAS = {
  a: { modelo: "anthropic/claude-x", esforco: "low", maxTokens: 100, timeoutMs: 5000, failover: ["google/g"] },
  b: { modelo: "google/g", timeoutMs: 5000 },
};

test("chat: corpo, cabeçalhos, max_tokens padrão e timeout por AbortSignal", async () => {
  const t = falso(resp(200, ok("olá")));
  assert.equal(await chat("openai/x", U, { ...t, referer: "https://s.com", titulo: "S" }), "olá");
  const [c] = t.chamadas;
  assert.equal(c.url, OPENROUTER_URL);
  assert.equal(c.corpo.model, "openai/x");
  assert.equal(c.corpo.max_tokens, 4000);
  assert.deepEqual(c.corpo.usage, { include: true });
  assert.equal(c.headers.authorization, "Bearer k");
  assert.equal(c.headers["HTTP-Referer"], "https://s.com");
  assert.ok(c.signal instanceof AbortSignal);
});

test("timeout vira ErroLlm transitório, repete uma vez e então falha", async () => {
  const t = falso(Object.assign(new Error("t"), { name: "TimeoutError" }));
  await assert.rejects(chat("openai/x", U, { ...t, timeoutMs: 2000 }), (e) => e instanceof ErroLlm && e.transitorio && /2 s/.test(e.message));
  assert.equal(t.chamadas.length, 2);
  assert.deepEqual(t.esperas, [1000]);
});

test("timeout real: AbortSignal.timeout derruba um fetch pendurado", async () => {
  const fetchImpl = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
  const vivo = setInterval(() => {}, 1000); // o timer do AbortSignal.timeout não segura o loop de eventos
  try {
    await assert.rejects(chat("openai/x", U, { fetchImpl, chave: () => "k", timeoutMs: 20, dormir: async () => {} }), /não respondeu/);
  } finally { clearInterval(vivo); }
});

test("429 com Retry-After: 2 dorme 2000 ms e repete uma vez", async () => {
  const t = falso(resp(429, { error: { message: "rate" } }, { "retry-after": "2" }), resp(200, ok("depois")));
  assert.equal(await chat("openai/x", U, t), "depois");
  assert.deepEqual(t.esperas, [2000]);
  assert.equal(t.chamadas.length, 2);
});

test("429 persistente para na 2ª tentativa (não laça)", async () => {
  const t = falso(resp(429, { error: { message: "rate" } }));
  await assert.rejects(chat("openai/x", U, t), (e) => e.status === 429);
  assert.equal(t.chamadas.length, 2);
});

test("5xx repete; 400 não repete", async () => {
  const a = falso(resp(503, {}), resp(200, ok("ok")));
  assert.equal(await chat("openai/x", U, a), "ok");
  const b = falso(resp(400, { error: { message: "ruim" } }));
  await assert.rejects(chat("openai/x", U, b), (e) => e.status === 400 && e.message === "ruim");
  assert.equal(b.chamadas.length, 1);
});

test("200 com error.code numérico repete (OpenRouter); código não numérico não vira status", async () => {
  const t = falso(resp(200, { error: { message: "up", code: 502 } }), resp(200, ok("ok")));
  assert.equal(await chat("openai/x", U, t), "ok");
  const n = falso(resp(200, { error: { message: "x", code: "abc" } }));
  await assert.rejects(chat("openai/x", U, n), (e) => e.status === undefined);
  assert.equal(n.chamadas.length, 1);
});

test("finish_reason length, recusa, resposta vazia e sem choices lançam", async () => {
  await assert.rejects(chat("o/x", U, falso(resp(200, { choices: [{ finish_reason: "length", message: { content: "x" } }] }))), /cortada/);
  await assert.rejects(chat("o/x", U, falso(resp(200, { choices: [{ message: { refusal: "no" } }] }))), /recusou/);
  await assert.rejects(chat("o/x", U, falso(resp(200, { choices: [{ message: { content: "" } }] }))), /vazia/);
  await assert.rejects(chat("o/x", U, falso(resp(200, {}))), /vazia/);
});

test("sem chave: ErroLlm legível e nenhuma chamada", async () => {
  const t = falso(resp(200, ok("x")));
  await assert.rejects(chat("o/x", U, { ...t, chave: () => undefined }), /OPENROUTER_API_KEY/);
  assert.equal(t.chamadas.length, 0);
});

test("falha de rede (TypeError) é transitória e repete", async () => {
  const t = falso(new TypeError("fetch failed"), resp(200, ok("ok")));
  assert.equal(await chat("o/x", U, t), "ok");
});

test("Retry-After: segundos, data HTTP, teto de 10 s, negativo e lixo", () => {
  const agora = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(esperaDoRetryAfter("3"), 3000);
  assert.equal(esperaDoRetryAfter("999"), 10_000);
  assert.equal(esperaDoRetryAfter("-5"), 0);
  assert.equal(esperaDoRetryAfter("Sat, 17 Oct 2026 12:00:04 GMT", agora), 4000);
  assert.equal(esperaDoRetryAfter("Sat, 17 Oct 2026 11:00:00 GMT", agora), 0);
  assert.equal(esperaDoRetryAfter("lixo"), undefined);
  assert.equal(esperaDoRetryAfter(null), undefined);
  assert.equal(repetivel(new Error("x")), false);
});

test("cache_control: só em anthropic/, e só se o chamador não marcou", async () => {
  const S = [{ role: "system", content: "regras" }, { role: "user", content: "oi" }];
  const a = falso(resp(200, ok("x")));
  await chat("anthropic/claude-x", S, a);
  assert.deepEqual(a.chamadas[0].corpo.messages[0].content, [{ type: "text", text: "regras", cache_control: { type: "ephemeral" } }]);
  assert.equal(a.chamadas[0].corpo.messages[1].content, "oi");
  const g = falso(resp(200, ok("x")));
  await chat("google/g", S, g);
  assert.equal(g.chamadas[0].corpo.messages[0].content, "regras");
  const marcado = [{ role: "system", content: [blocoFixo("f"), { type: "text", text: "d" }] }, { role: "user", content: "q" }];
  assert.equal(comCacheAutomatico("anthropic/x", marcado), marcado);
  assert.equal(comCacheAutomatico("anthropic/x", [{ role: "system", content: "" }])[0].content, "");
});

test("cliente por tarefa: tokensCache vem de cached_tokens e cada tentativa vira linha", async () => {
  const linhas = [];
  const t = falso(resp(429, {}), resp(200, ok("fim", {
    usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.5, prompt_tokens_details: { cached_tokens: 7 } },
  })));
  const cli = criarClienteLlm({ tarefas: TAREFAS, ...t, registrar: async (l) => { linhas.push(l); } });
  const r = await cli.chamar({ tarefa: "b", mensagens: U, pesquisaId: "p1" });
  assert.deepEqual([r.texto, r.tokensEntrada, r.tokensSaida, r.tokensCache, r.custoUsd], ["fim", 10, 2, 7, 0.5]);
  assert.equal(linhas.length, 2);
  assert.match(linhas[0].erro, /HTTP 429/);
  assert.equal(linhas[1].erro, null);
  assert.equal(linhas[1].pesquisaId, "p1");
});

test("cliente: parâmetros da tarefa e override da chamada; tarefa desconhecida e registrar que falha", async () => {
  const t = falso(resp(200, ok("x")));
  const cli = criarClienteLlm({ tarefas: TAREFAS, ...t, registrar: async () => { throw new Error("banco"); } });
  await cli.chamar({ tarefa: "a", mensagens: U, formato: { type: "json_object" } });
  const c = t.chamadas[0].corpo;
  assert.deepEqual([c.model, c.max_tokens, c.reasoning, c.response_format], ["anthropic/claude-x", 100, { effort: "low" }, { type: "json_object" }]);
  await cli.chamar({ tarefa: "a", mensagens: U, maxTokens: 9, esforco: "high" });
  assert.equal(t.chamadas[1].corpo.max_tokens, 9);
  assert.deepEqual(t.chamadas[1].corpo.reasoning, { effort: "high" });
  await assert.rejects(cli.chamar({ tarefa: "zzz", mensagens: U }), /desconhecida/);
});

test("failover: depois de 2 falhas repetíveis, usa o modelo seguinte; 4xx do failover não segue", async () => {
  const t = falso(resp(503, {}), resp(503, {}), resp(200, ok("salvo", { model: "google/g" })));
  const cli = criarClienteLlm({ tarefas: TAREFAS, ...t });
  const r = await cli.chamar({ tarefa: "a", mensagens: U });
  assert.equal(r.texto, "salvo");
  assert.deepEqual(t.chamadas.map((c) => c.corpo.model), ["anthropic/claude-x", "anthropic/claude-x", "google/g"]);
  // principal falha 2x (503), o alternativo devolve 400: lança o 400 e não tenta mais nada
  const dois = { ...TAREFAS, a: { ...TAREFAS.a, failover: ["google/g", "google/h"] } };
  const so4 = falso(resp(503, {}), resp(503, {}), resp(400, {}), resp(200, ok("nunca")));
  await assert.rejects(criarClienteLlm({ tarefas: dois, ...so4 }).chamar({ tarefa: "a", mensagens: U }), (e) => e.status === 400);
  assert.deepEqual(so4.chamadas.map((c) => c.corpo.model), ["anthropic/claude-x", "anthropic/claude-x", "google/g"]);
  // 400 já no principal: não repete e não usa failover
  const direto = falso(resp(400, {}));
  await assert.rejects(criarClienteLlm({ tarefas: TAREFAS, ...direto }).chamar({ tarefa: "a", mensagens: U }));
  assert.equal(direto.chamadas.length, 1);
});

test("falha ao ler o corpo (timeout/rede) é transitória: repete em vez de virar resposta vazia", async () => {
  const quebrada = () => {
    const corpo = new ReadableStream({ pull(c) { c.error(new DOMException("tempo", "TimeoutError")); } });
    return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
  };
  let n = 0;
  const t = falso(resp(200, ok("veio")));
  const base = t.fetchImpl;
  t.fetchImpl = async (u, i) => (++n === 1 ? (t.chamadas.push({ corpo: JSON.parse(i.body) }), quebrada()) : base(u, i));
  assert.equal(await chat("a/x", U, t), "veio");
  assert.equal(n, 2);
});

test("chat com failover e tudo falhando: lança o último erro, sem laço", async () => {
  const t = falso(resp(503, {}));
  await assert.rejects(chat("a/x", U, { ...t, failover: ["b/y", "c/z"] }), (e) => e.status === 503);
  assert.equal(t.chamadas.length, 4); // 2 + 1 + 1
});

test("embeddings: ordem por index, dimensões, lote vazio, contagem errada e retry", async () => {
  const v = (n, x) => Array.from({ length: n }, () => x);
  const t = falso(resp(200, { data: [{ index: 1, embedding: v(3, 2) }, { index: 0, embedding: v(3, 1) }], usage: { prompt_tokens: 4 } }));
  const emb = criarEmbeddings({ modelo: "openai/e", dimensoes: 3, ...t });
  assert.deepEqual(await emb(["a", "b"]), [[1, 1, 1], [2, 2, 2]]);
  assert.equal(t.chamadas[0].corpo.dimensions, 3);
  assert.deepEqual(await emb([]), []);
  assert.equal(t.chamadas.length, 1);
  await assert.rejects(criarEmbeddings({ modelo: "m", dimensoes: 3, ...falso(resp(200, { data: [{ embedding: v(2, 1) }] })) })(["a"]), /2 dimensões/);
  await assert.rejects(criarEmbeddings({ modelo: "m", dimensoes: 3, ...falso(resp(200, { data: [] })) })(["a"]), /0 vetores/);
  const r = falso(resp(500, {}), resp(200, { data: [{ embedding: v(3, 1) }] }));
  assert.deepEqual(await criarEmbeddings({ modelo: "m", dimensoes: 3, ...r })(["a"]), [[1, 1, 1]]);
});

test("embeddings: corte por texto padrão 8000 e configurável", async () => {
  const resposta = () => resp(200, { data: [{ embedding: [1] }] });
  const longo = "x".repeat(9000);
  const a = falso(resposta());
  await criarEmbeddings({ modelo: "m", dimensoes: 1, ...a })([longo]);
  assert.equal(a.chamadas[0].corpo.input[0].length, 8000);
  const b = falso(resposta());
  await criarEmbeddings({ modelo: "m", dimensoes: 1, maxCaracteres: Infinity, ...b })([longo]);
  assert.equal(b.chamadas[0].corpo.input[0].length, 9000);
});
