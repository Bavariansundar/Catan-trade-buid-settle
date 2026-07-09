import { parentPort, workerData } from "node:worker_threads";
import { playOneMatch, type MatchResult } from "./gameRunner.js";
import type { BotSpec } from "./botSpec.js";

export interface WorkerJob {
  readonly specA: BotSpec;
  readonly specB: BotSpec;
  /** This worker's slice of the tournament's global game indices (used to derive seeds + seat-swap parity). */
  readonly gameIndices: readonly number[];
  readonly seedPrefix: string;
}

export interface WorkerResult {
  readonly aWins: number;
  readonly bWins: number;
  readonly incomplete: number;
}

function runJob(job: WorkerJob): WorkerResult {
  let aWins = 0;
  let bWins = 0;
  let incomplete = 0;
  for (const gameIndex of job.gameIndices) {
    const result: MatchResult = playOneMatch(
      job.specA,
      job.specB,
      `${job.seedPrefix}:${String(gameIndex)}`,
      gameIndex % 2 === 1,
    );
    if (result === "A") aWins += 1;
    else if (result === "B") bWins += 1;
    else incomplete += 1;
  }
  return { aWins, bWins, incomplete };
}

// This file is only ever loaded as a worker_threads entry point (see
// runTournament.ts) — workerData/parentPort are always present at runtime.
if (parentPort) {
  const result = runJob(workerData as WorkerJob);
  parentPort.postMessage(result);
}
