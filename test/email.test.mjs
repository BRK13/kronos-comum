import test from "node:test";
import assert from "node:assert/strict";
import { enviar, montarCarga, API_RESEND } from "../dist/email.js";

const resp = (status, corpo, headers = {}) => ({ ok: status < 400, status, headers: new Headers(headers), json: async () => corpo });
const falso = (r) => { const chamadas = []; const f = async (u, i) => { chamadas.push({ u, i }); return typeof r === "function" ? r() : r; }; return { f, chamadas }; };

test("corpo, cabeçalhos e idempotência idênticos ao esperado", async () => {
  const { f, chamadas } = falso(resp(200, { id: "abc" }));
  const r = await enviar({ de: "A <a@x.com>", para: "b@x.com", assunto: "S", html: "<p>h</p>", texto: "t", responderPara: "r@x.com",
    anexos: [{ filename: "n.pdf", content: "QQ==" }], idempotencia: "k1" }, { chave: "re_k", fetchImpl: f });
  assert.deepEqual(r, { ok: true, id: "abc" });
  assert.equal(chamadas[0].u, API_RESEND);
  assert.equal(chamadas[0].i.headers.Authorization, "Bearer re_k");
  assert.equal(chamadas[0].i.headers["Idempotency-Key"], "k1");
  assert.deepEqual(JSON.parse(chamadas[0].i.body), { from: "A <a@x.com>", to: ["b@x.com"], subject: "S", html: "<p>h</p>", text: "t",
    reply_to: "r@x.com", attachments: [{ filename: "n.pdf", content: "QQ==" }] });
  assert.ok(chamadas[0].i.signal);
});

test("to lista, vazios filtrados; sem destinatário não chama a rede", async () => {
  assert.deepEqual(montarCarga({ de: "a", para: ["x@x.com", ""], assunto: "s" }).to, ["x@x.com"]);
  const { f, chamadas } = falso(resp(200, { id: "1" }));
  const r = await enviar({ de: "a", para: [], assunto: "s" }, { chave: "k", fetchImpl: f });
  assert.equal(r.ok, false); assert.equal(chamadas.length, 0);
});

test("sem chave: não envia e não lança", async () => {
  const antes = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  const { f, chamadas } = falso(resp(200, { id: "1" }));
  const r = await enviar({ de: "a", para: "b@x.com", assunto: "s" }, { fetchImpl: f });
  if (antes) process.env.RESEND_API_KEY = antes;
  assert.deepEqual(r, { ok: false, status: 0, erro: "RESEND_API_KEY não configurada" }); assert.equal(chamadas.length, 0);
});

test("429 devolve retry-after; 409 e 500 viram falha; rede e timeout não lançam", async () => {
  let r = await enviar({ de: "a", para: "b@x.com", assunto: "s" }, { chave: "k", fetchImpl: falso(resp(429, { message: "slow" }, { "retry-after": "7" })).f });
  assert.deepEqual(r, { ok: false, status: 429, erro: "slow", esperarS: 7 });
  r = await enviar({ de: "a", para: "b@x.com", assunto: "s" }, { chave: "k", fetchImpl: falso(resp(409, { name: "concurrent_idempotent_requests" })).f });
  assert.equal(r.ok, false); assert.equal(r.status, 409);
  r = await enviar({ de: "a", para: "b@x.com", assunto: "s" }, { chave: "k", fetchImpl: falso(() => { throw new Error("ECONNRESET"); }).f });
  assert.deepEqual(r, { ok: false, status: 0, erro: "ECONNRESET" });
  const lento = (_u, i) => new Promise((_ok, no) => { const t = setTimeout(() => {}, 2000); i.signal.addEventListener("abort", () => { clearTimeout(t); no(i.signal.reason); }); });
  r = await enviar({ de: "a", para: "b@x.com", assunto: "s" }, { chave: "k", timeoutMs: 20, fetchImpl: lento });
  assert.equal(r.ok, false); assert.equal(r.status, 0);
});
