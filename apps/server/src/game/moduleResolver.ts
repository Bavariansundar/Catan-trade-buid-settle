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

export class UnknownModuleError extends Error {}

/**
 * Turns a lobby's `enabledModuleIds` (see docs/architecture/server.md §1)
 * into the actual `RuleModule[]` the engine needs — `BASE_MODULE` is always
 * first. IDs mirror the engine's own `RuleModule.id` strings directly; a
 * Seafarers-style scenario is addressed as `"seafarers-style:<scenario-id>"`.
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
      if (!scenario)
        throw new UnknownModuleError(`Unknown seafarers-style scenario "${scenarioId}"`);
      modules.push(createSeafarersModule(scenario));
      continue;
    }
    throw new UnknownModuleError(`Unknown module id "${id}"`);
  }
  return modules;
}
