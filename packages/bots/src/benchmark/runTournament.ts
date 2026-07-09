import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { playOneMatch } from "./gameRunner.js";
import type { BotSpec } from "./botSpec.js";
import type { WorkerJob, WorkerResult } from "./worker.js";

export interface TournamentResult {
  readonly games: number;
  readonly aWins: number;
  readonly bWins: number;
  readonly incomplete: number;
  readonly aWinRate: number;
}

function summarize(
  games: number,
  aWins: number,
  bWins: number,
  incomplete: number,
): TournamentResult {
  return { games, aWins, bWins, incomplete, aWinRate: aWins / (games - incomplete || 1) };
}

/**
 * In-process (no worker threads) tournament runner — used by this
 * package's own fast unit tests to check the win-tallying/seat-alternation
 * logic. The real, worker-parallelized runner is {@link runTournament}
 * below; see its doc for why the two are split.
 */
export function runTournamentSequential(
  specA: BotSpec,
  specB: BotSpec,
  games: number,
  seedPrefix: string,
): TournamentResult {
  let aWins = 0;
  let bWins = 0;
  let incomplete = 0;
  for (let i = 0; i < games; i++) {
    const result = playOneMatch(specA, specB, `${seedPrefix}:${String(i)}`, i % 2 === 1);
    if (result === "A") aWins += 1;
    else if (result === "B") bWins += 1;
    else incomplete += 1;
  }
  return summarize(games, aWins, bWins, incomplete);
}

/**
 * Worker-thread-parallelized round-robin tournament between two bot tiers
 * (see CLAUDE.md's bot architecture note: "Bots run in a worker thread").
 * Splits `games` across `Math.min(workerCount, games)` worker threads, each
 * running its slice sequentially via the same `playOneMatch` the sequential
 * runner uses, and aggregates their counts.
 *
 * The worker entry point is resolved as a *built* `.js` file next to this
 * one — this only works when running from `dist/` (after `pnpm build`),
 * matching how the rest of this package resolves its own compiled output at
 * runtime. Not exercised by this package's `vitest` suite for that reason
 * (vitest transforms `.ts` on the fly in-process; a spawned worker_thread
 * pointing at a `.ts` path has no such transform) — instead run via the
 * `bench` CLI script (see package.json) against the built package.
 */
export async function runTournament(
  specA: BotSpec,
  specB: BotSpec,
  games: number,
  seedPrefix: string,
  workerCount: number = Math.max(1, Math.min(availableParallelism(), games)),
): Promise<TournamentResult> {
  const chunks: number[][] = Array.from({ length: workerCount }, () => []);
  for (let i = 0; i < games; i++) chunks[i % workerCount]!.push(i);

  const workerUrl = new URL("./worker.js", import.meta.url);
  const results = await Promise.all(
    chunks
      .filter((chunk) => chunk.length > 0)
      .map(
        (gameIndices) =>
          new Promise<WorkerResult>((resolve, reject) => {
            const job: WorkerJob = { specA, specB, gameIndices, seedPrefix };
            const worker = new Worker(workerUrl, { workerData: job });
            worker.once("message", (result: WorkerResult) => {
              resolve(result);
              void worker.terminate();
            });
            worker.once("error", reject);
          }),
      ),
  );

  const totals = results.reduce(
    (acc, r) => ({
      aWins: acc.aWins + r.aWins,
      bWins: acc.bWins + r.bWins,
      incomplete: acc.incomplete + r.incomplete,
    }),
    { aWins: 0, bWins: 0, incomplete: 0 },
  );
  return summarize(games, totals.aWins, totals.bWins, totals.incomplete);
}
