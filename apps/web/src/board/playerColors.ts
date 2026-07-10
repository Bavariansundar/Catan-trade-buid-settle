/** Stable, colorblind-considerate palette assigned by seat order. */
export const PLAYER_COLORS = [
  "#e2584f", // red
  "#4a90d9", // blue
  "#f2a544", // orange
  "#5fb87a", // green
  "#b06fd6", // purple
  "#d9c14a", // yellow
];

export function colorForSeat(seatIndex: number): string {
  return PLAYER_COLORS[seatIndex % PLAYER_COLORS.length]!;
}

export function playerColorMap(playerIds: readonly string[]): Record<string, string> {
  const map: Record<string, string> = {};
  playerIds.forEach((id, i) => {
    map[id] = colorForSeat(i);
  });
  return map;
}
