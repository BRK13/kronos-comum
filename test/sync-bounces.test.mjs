import test from "node:test";
import assert from "node:assert/strict";
import { coletarBounces, marcarBounces } from "../sync-bounces.mjs";

test("pagina com cursor, só eventos ruins, minúsculas, primeiro vence", async () => {
  const paginas = [
    { has_more: true, data: [{ id: "1", to: ["A@x.com"], last_event: "bounced", created_at: "t1" }, { id: "2", to: ["ok@x.com"], last_event: "delivered" }] },
    { has_more: false, data: [{ id: "3", to: ["a@x.com", "c@x.com"], last_event: "complained", created_at: "t3" }] },
  ];
  const urls = []; let i = 0;
  const fetchImpl = async (u) => { urls.push(String(u)); return { ok: true, json: async () => paginas[i++] }; };
  const { ruins, total, paginas: n } = await coletarBounces({ chave: "k", fetchImpl });
  assert.equal(n, 2); assert.equal(total, 3);
  assert.deepEqual([...ruins.keys()], ["a@x.com", "c@x.com"]); assert.equal(ruins.get("a@x.com").id, "1");
  assert.match(urls[1], /after=2/);
  const linhas = [{ email: "a@x.com", status: "sent" }, { email: "c@x.com", status: "unsubscribed" }];
  assert.equal(marcarBounces(linhas, ruins).length, 1); assert.equal(linhas[0].status, "bounced"); assert.equal(linhas[1].status, "unsubscribed");
});
test("erro HTTP lança; sem chave lança", async () => {
  await assert.rejects(coletarBounces({ chave: "k", fetchImpl: async () => ({ ok: false, status: 401, text: async () => "no" }) }), /401/);
  const a = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  await assert.rejects(coletarBounces({ fetchImpl: async () => ({}) }), /ausente/);
  if (a) process.env.RESEND_API_KEY = a;
});
