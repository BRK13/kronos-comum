import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv, loadEnv, lerChave } from "../env.mjs";

test("export, aspas pareadas, comentário, CRLF, = no valor", () => {
  assert.deepEqual(parseEnv('# c\r\nexport A=1\r\nB="x y"\r\nC=\'z\'\nD=a=b\nE="aberta\n\nsemigual'), { A: "1", B: "x y", C: "z", D: "a=b", E: '"aberta' });
});
test("loadEnv: ambiente vence, override sobrescreve; sem arquivo não faz nada", () => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), "kc-")), ".env"); writeFileSync(f, "A=novo\nB=2\n");
  const env = { A: "velho" };
  assert.deepEqual(loadEnv(f, { env }), ["B"]); assert.equal(env.A, "velho");
  loadEnv(f, { env, override: true }); assert.equal(env.A, "novo");
  assert.deepEqual(loadEnv("/nao/existe", { env }), []);
  assert.equal(lerChave(f, "B"), "2"); assert.equal(lerChave(f, "Z"), undefined);
});
