export * from "./types.js";
export * from "./boardGeometry.js";
export * from "./legalActions.js";
export * from "./evaluate.js";
export * from "./ruleBasedBot.js";
export * from "./heuristicBot.js";
export * from "./mctsBot.js";
export * from "./turnHelpers.js";

// Deliberately NOT re-exported: ./benchmark/* imports `node:os` and
// `node:worker_threads` at module scope, which throws immediately if this
// package is ever loaded in a browser (e.g. apps/web's single-player Web
// Worker, per CLAUDE.md's "in a Web Worker in the browser for offline
// single-player"). The benchmark CLI (packages/bots/src/benchmark/cli.ts,
// run via `pnpm bench`) imports those modules directly by relative path
// instead of through this barrel.
