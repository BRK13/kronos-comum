export type Versao = {
    commit: string | null;
    buildStamp: string | null;
    startedAt: string;
};
type Ler = (arquivo: string) => string;
/** Hash do HEAD de um diretório .git: HEAD solto, ref em arquivo ou ref em packed-refs. null se não achar. */
export declare function commitDoGit(dirGit: string, ler?: Ler): string | null;
/** Commit servido: SOURCE_COMMIT/GIT_SHA (se o build passar) ou o .git da raiz do app. Lido uma vez. */
export declare function commitNoAr(env?: NodeJS.ProcessEnv, cwd?: string): string | null;
export declare function versao(env?: NodeJS.ProcessEnv, cwd?: string): Versao;
/** Corpo da rota: `export const GET = rotaVersao; export const dynamic = "force-dynamic";` */
export declare function rotaVersao(): Response;
export {};
