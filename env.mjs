// Leitura de .env sem dependência. Base: acta-control/scripts/prospeccao-blast/_shared.mjs:282 (aspas pareadas, \r)
// + `export`. Precedência: o que já está no ambiente vence, salvo override.
import { readFileSync, existsSync } from "node:fs";

/** Texto de um .env -> objeto. Aceita `export X=`, aspas pareadas, comentário de linha inteira e CRLF. */
export function parseEnv(texto) {
  const out = {};
  for (const linha of String(texto).split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const chave = t.slice(0, eq).replace(/^export\s+/, "").trim();
    if (!chave) continue;
    let valor = t.slice(eq + 1).trim();
    if (valor.length >= 2 && (valor[0] === '"' || valor[0] === "'") && valor.at(-1) === valor[0]) valor = valor.slice(1, -1);
    out[chave] = valor;
  }
  return out;
}

/** Carrega o arquivo em process.env. Sem o arquivo, não faz nada. Devolve as chaves gravadas. */
export function loadEnv(caminho, { override = false, env = process.env } = {}) {
  if (!existsSync(caminho)) return [];
  const gravadas = [];
  for (const [k, v] of Object.entries(parseEnv(readFileSync(caminho, "utf8")))) {
    if (override || !env[k]) {
      env[k] = v;
      gravadas.push(k);
    }
  }
  return gravadas;
}

/** Valor de uma chave direto do arquivo (sem mexer no ambiente); undefined se não existir. */
export function lerChave(caminho, nome) {
  if (!existsSync(caminho)) return undefined;
  return parseEnv(readFileSync(caminho, "utf8"))[nome];
}
