import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitDoGit, commitNoAr, versao } from "../dist/versao.js";

const SHA = "a".repeat(40);
test("commit do env, do HEAD solto, ref e packed-refs", () => {
  assert.equal(commitNoAr({ SOURCE_COMMIT: SHA.toUpperCase() }, "/x"), SHA);
  const d = mkdtempSync(path.join(tmpdir(), "kc-"));
  mkdirSync(path.join(d, ".git/refs/heads"), { recursive: true });
  writeFileSync(path.join(d, ".git/HEAD"), "ref: refs/heads/main\n");
  assert.equal(commitDoGit(path.join(d, ".git")), null);
  writeFileSync(path.join(d, ".git/packed-refs"), `# x\n${SHA} refs/heads/main\n`);
  assert.equal(commitNoAr({}, d), SHA);
  writeFileSync(path.join(d, ".git/refs/heads/main"), "b".repeat(40) + "\n");
  assert.equal(commitDoGit(path.join(d, ".git")), "b".repeat(40));
  assert.equal(commitNoAr({}, "/nao/existe"), null);
});
test("contrato { commit, buildStamp, startedAt }", () => {
  const v = versao({ SOURCE_COMMIT: SHA, NEXT_PUBLIC_BUILD_STAMP: "2026-10-17T00:00" }, "/x");
  assert.deepEqual(Object.keys(v).sort(), ["buildStamp", "commit", "startedAt"]);
  assert.equal(v.commit, SHA); assert.equal(v.buildStamp, "2026-10-17T00:00");
  assert.ok(!Number.isNaN(Date.parse(v.startedAt)));
  assert.equal(versao({}, "/x").buildStamp, null);
});
