import {
  BASE_MODULE,
  CITIES_KNIGHTS_MODULE,
  createSeafarersModule,
  FIVE_SIX_PLAYERS_MODULE,
  SCATTERED_ARCHIPELAGO,
  THE_STRAIT,
  TWIN_ISLES,
  type RuleModule,
  type ScenarioDefinition,
} from "@hexhaven/engine";

const SEAFARERS_SCENARIOS_BY_ID: Record<string, ScenarioDefinition> = {
  "twin-isles": TWIN_ISLES,
  "the-strait": THE_STRAIT,
  "scattered-archipelago": SCATTERED_ARCHIPELAGO,
};

/**
 * Client-side mirror of apps/server's game/moduleResolver.ts — needed so a
 * replay (folding a fetched action log through `createGame`/`applyAction`
 * locally) uses the exact same module set the real game did. Small and
 * engine-only, so duplicating it here is cheaper than sharing a package for
 * one function.
 */
export function resolveModules(enabledModuleIds: readonly string[]): RuleModule[] {
  const modules: RuleModule[] = [BASE_MODULE];
  for (const id of enabledModuleIds) {
    if (id === "five-six-players") {
      modules.push(FIVE_SIX_PLAYERS_MODULE);
      continue;
    }
    if (id === "cities-knights-style") {
      modules.push(CITIES_KNIGHTS_MODULE);
      continue;
    }
    if (id.startsWith("seafarers-style:")) {
      const scenarioId = id.slice("seafarers-style:".length);
      const scenario = SEAFARERS_SCENARIOS_BY_ID[scenarioId];
      if (scenario) modules.push(createSeafarersModule(scenario));
      continue;
    }
  }
  return modules;
}
