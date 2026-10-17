# kronos-comum

Código comum dos sites (BRU-921, F5 da faxina). Sem registry e sem Actions: a tag `kronos-comum-v<versão>` é um commit órfão só com esta pasta.

    yarn add https://github.com/BRK13/kronos-comum/archive/refs/tags/v0.1.0.tar.gz   # npm i funciona igual; tarball porque o build do Dokploy não tem git

| Import | Para quê |
|---|---|
| `kronos-comum/email` | `enviar({de, para, assunto, html, texto, responderPara, anexos, idempotencia})` -> `{ok, id}` ou `{ok:false, status, erro, esperarS}`; nunca lança; 15 s; `Idempotency-Key` |
| `kronos-comum/versao` | `rotaVersao()` para `app/api/versao/route.ts`: `{commit, buildStamp, startedAt}` |
| `kronos-comum/moeda` | `formatarBRL(1234, "centavos") == "R$ 12,34"`; unidade sempre explícita |
| `kronos-comum/llm` | `chat("google/gemini-2.5-flash", mensagens)` → texto, com timeout (60 s), 1 retry em 429/5xx/timeout (`Retry-After` com teto de 10 s), `cache_control` em modelo `anthropic/` e `failover`; `criarClienteLlm({tarefas})` (por tarefa, com `registrar`) e `criarEmbeddings`. Chave: `OPENROUTER_API_KEY`. Substitui o `lib/llm.ts` dos sites (F6) |
| `kronos-comum/env` | `loadEnv(arquivo, {override})`, `lerChave`, `parseEnv` |
| `kronos-comum/sync-bounces` | `coletarBounces()` + `marcarBounces(linhas, ruins)` no lugar dos 9 `sync-bounces.mjs` |

Mudou `src/`? `cd packages/kronos-comum && tsc -p tsconfig.json` (o `dist/` vai commitado: o install por git não compila), `npm test`, suba a versão e rode `scripts/publicar-kronos-comum.sh --push` na raiz do hub.
