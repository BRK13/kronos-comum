import { readFileSync } from "node:fs";
import path from "node:path";
const SHA = /^[0-9a-f]{40}$/;
/** Hash do HEAD de um diretório .git: HEAD solto, ref em arquivo ou ref em packed-refs. null se não achar. */
export function commitDoGit(dirGit, ler = (f) => readFileSync(f, "utf8")) {
    const tentar = (f) => {
        try {
            return ler(path.join(dirGit, f));
        }
        catch {
            return null;
        }
    };
    const head = tentar("HEAD")?.trim();
    if (!head)
        return null;
    if (SHA.test(head))
        return head;
    const ref = head.match(/^ref:\s*(\S+)$/)?.[1];
    if (!ref)
        return null;
    const solto = tentar(ref)?.trim();
    if (solto && SHA.test(solto))
        return solto;
    for (const linha of (tentar("packed-refs") ?? "").split(/\r?\n/)) {
        const [sha, nome] = linha.trim().split(/\s+/);
        if (nome === ref && SHA.test(sha ?? ""))
            return sha;
    }
    return null;
}
const iniciouEm = new Date().toISOString();
let emMemoria;
/** Commit servido: SOURCE_COMMIT/GIT_SHA (se o build passar) ou o .git da raiz do app. Lido uma vez. */
export function commitNoAr(env = process.env, cwd = process.cwd()) {
    const usarCache = env === process.env && cwd === process.cwd();
    if (usarCache && emMemoria !== undefined)
        return emMemoria;
    const doEnv = (env.SOURCE_COMMIT ?? env.NEXT_PUBLIC_GIT_SHA)?.trim().toLowerCase();
    const r = doEnv && SHA.test(doEnv) ? doEnv : commitDoGit(path.join(cwd, ".git"));
    if (usarCache)
        emMemoria = r;
    return r;
}
export function versao(env = process.env, cwd = process.cwd()) {
    return {
        commit: commitNoAr(env, cwd),
        buildStamp: env.NEXT_PUBLIC_BUILD_STAMP?.trim() || null,
        startedAt: iniciouEm,
    };
}
/** Corpo da rota: `export const GET = rotaVersao; export const dynamic = "force-dynamic";` */
export function rotaVersao() {
    return Response.json(versao(), { headers: { "cache-control": "no-store" } });
}
