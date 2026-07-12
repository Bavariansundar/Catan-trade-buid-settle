/**
 * @type {import('jest').Config}
 *
 * Server runs as ESM (package.json "type": "module") to match
 * @baychearsbar/engine and @baychearsbar/bots, which only ship ESM builds — see
 * docs/architecture/server.md. This is ts-jest's documented ESM recipe:
 * treat .ts as ESM, run ts-jest in useESM mode, and map the explicit ".js"
 * extensions our own source uses in relative imports back to the .ts
 * source files ts-jest actually has on disk.
 */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  testMatch: ["<rootDir>/src/**/*.test.ts"],
};
