import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Full-game bot simulations (setup through a decided winner) are the
    // primary correctness check in this package (see ruleBasedBot.test.ts,
    // heuristicBot.test.ts, mctsBot.test.ts) and legitimately take longer
    // than vitest's 5s default, especially with lookahead/search involved.
    testTimeout: 60_000,
  },
});
