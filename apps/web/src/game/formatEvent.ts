import type { GameEvent } from "@hexhaven/engine";

/** Human-readable one-line summary of a `GameEvent`, for the action log and toasts. */
export function formatEvent(event: GameEvent, nameFor: (playerId: string) => string): string {
  switch (event.type) {
    case "SETTLEMENT_PLACED":
    case "SETTLEMENT_BUILT":
      return `${nameFor(event.playerId)} built a settlement`;
    case "CITY_BUILT":
      return `${nameFor(event.playerId)} upgraded to a city`;
    case "ROAD_PLACED":
    case "ROAD_BUILT":
      return `${nameFor(event.playerId)} built a road`;
    case "STARTING_RESOURCES_GRANTED":
      return `${nameFor(event.playerId)} received starting resources`;
    case "SETUP_COMPLETED":
      return "Setup complete — the game begins";
    case "DICE_ROLLED":
      return `${nameFor(event.playerId)} rolled ${event.roll[0]} + ${event.roll[1]} = ${event.roll[0] + event.roll[1]}`;
    case "RESOURCES_PRODUCED":
      return "Resources produced";
    case "MUST_DISCARD":
      return `${nameFor(event.playerId)} must discard ${event.count} cards`;
    case "DISCARDED":
      return `${nameFor(event.playerId)} discarded cards`;
    case "ROBBER_MOVED":
      return `${nameFor(event.playerId)} moved the robber`;
    case "RESOURCE_STOLEN":
      return `${nameFor(event.thiefId)} stole a card from ${nameFor(event.victimId)}`;
    case "TURN_STARTED":
      return `${nameFor(event.playerId)}'s turn`;
    case "TURN_ENDED":
      return `${nameFor(event.playerId)} ended their turn`;
    case "SPECIAL_BUILD_STARTED":
      return "Special building phase";
    case "SPECIAL_BUILD_PASSED":
      return `${nameFor(event.playerId)} passed on special building`;
    case "SPECIAL_BUILD_ENDED":
      return "Special building phase ended";
    case "TRADE_PROPOSED":
      return `${nameFor(event.proposerId)} proposed a trade`;
    case "TRADE_ACCEPTED":
      return `${nameFor(event.accepterId)} accepted ${nameFor(event.proposerId)}'s trade`;
    case "TRADE_REJECTED":
      return `${nameFor(event.playerId)} rejected a trade`;
    case "TRADE_COUNTERED":
      return `${nameFor(event.playerId)} countered a trade`;
    case "TRADE_CANCELLED":
      return "A trade offer was cancelled";
    case "MARITIME_TRADE_EXECUTED":
      return `${nameFor(event.playerId)} traded ${event.gaveAmount} ${event.gave} for 1 ${event.got}`;
    case "DEV_CARD_BOUGHT":
      return `${nameFor(event.playerId)} bought a development card`;
    case "KNIGHT_PLAYED":
      return `${nameFor(event.playerId)} played a Knight`;
    case "MONOPOLY_PLAYED":
      return `${nameFor(event.playerId)} played Monopoly on ${event.resource}`;
    case "ROAD_BUILDING_PLAYED":
      return `${nameFor(event.playerId)} played Road Building`;
    case "YEAR_OF_PLENTY_PLAYED":
      return `${nameFor(event.playerId)} played Year of Plenty`;
    case "LONGEST_ROAD_AWARDED":
      return `${nameFor(event.playerId)} took Longest Road (${event.length})`;
    case "LONGEST_ROAD_LOST":
      return `${nameFor(event.playerId)} lost Longest Road`;
    case "LARGEST_ARMY_AWARDED":
      return `${nameFor(event.playerId)} took Largest Army (${event.knights})`;
    case "GAME_ENDED":
      return `${nameFor(event.winner)} wins!`;
    default:
      return event.type.replaceAll("_", " ").toLowerCase();
  }
}
