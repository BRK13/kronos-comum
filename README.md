# kronos-comum

Código comum dos sites (BRU-921, F5 da faxina). Sem registry e sem Actions: a tag `kronos-comum-v<versão>` é um commit órfão só com esta pasta.

    yarn add github:BRK13/superorganic-hub#kronos-comum-v0.1.0   # npm i funciona igual

| Import | Para quê |
|---|---|
| `kronos-comum/email` | `enviar({de, para, assunto, html, texto, responderPara, anexos, idempotencia})` -> `{ok, id}` ou `{ok:false, status, erro, esperarS}`; nunca lança; 15 s; `Idempotency-Key` |
| `kronos-comum/versao` | `rotaVersao()` para `app/api/versao/route.ts`: `{commit, buildStamp, startedAt}` |
| `kronos-comum/moeda` | `formatarBRL(1234, "centavos") == "R$ 12,34"`; unidade sempre explícita |
| `kronos-comum/env` | `loadEnv(arquivo, {override})`, `lerChave`, `parseEnv` |
| `kronos-comum/sync-bounces` | `coletarBounces()` + `marcarBounces(linhas, ruins)` no lugar dos 9 `sync-bounces.mjs` |

Mudou `src/`? `cd packages/kronos-comum && tsc -p tsconfig.json` (o `dist/` vai commitado: o install por git não compila), `npm test`, suba a versão e rode `scripts/publicar-kronos-comum.sh --push` na raiz do hub.
