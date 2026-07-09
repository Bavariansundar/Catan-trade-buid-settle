import { BASE_BOARD_SPEC, generateBoard } from "@hexhaven/engine";

export function App() {
  const board = generateBoard(BASE_BOARD_SPEC, { seed: "web-scaffold" });
  return (
    <main>
      <h1>Hexhaven</h1>
      <p>board tiles: {board.tiles.length}</p>
    </main>
  );
}
