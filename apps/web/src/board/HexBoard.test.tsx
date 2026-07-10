import { fireEvent, render } from "@testing-library/react";
import { BASE_MODULE, createGame, verticesOfHex, viewFor } from "@hexhaven/engine";
import { describe, expect, it, vi } from "vitest";
import { HexBoard } from "./HexBoard.js";

describe("HexBoard — city upgrade clicking", () => {
  it("invokes onVertexClick for an occupied vertex marked as a legal city-upgrade target", () => {
    const state = createGame([BASE_MODULE], { playerIds: ["a", "b"], seed: "hexboard-city-test" });
    const view = viewFor([BASE_MODULE], state, "a");
    const vertex = verticesOfHex(state.board.tiles[0]!.hex)[0]!;

    const viewWithSettlement = {
      ...view,
      buildings: new Map([[vertex.id, { playerId: "a", type: "settlement" as const }]]),
    };

    const onVertexClick = vi.fn();
    const { container } = render(
      <HexBoard
        view={viewWithSettlement}
        playerColors={{ a: "#f00", b: "#00f" }}
        legalVertexIds={new Set([vertex.id])}
        onVertexClick={onVertexClick}
      />,
    );

    const clickableGroup = [...container.querySelectorAll("g")].find(
      (g) => (g as unknown as { onclick: unknown }).onclick,
    );
    expect(clickableGroup).toBeTruthy();
    fireEvent.click(clickableGroup!);

    expect(onVertexClick).toHaveBeenCalledWith(expect.objectContaining({ id: vertex.id }));
  });

  it("does not attach a click handler to an occupied vertex that is not a legal target", () => {
    const state = createGame([BASE_MODULE], {
      playerIds: ["a", "b"],
      seed: "hexboard-city-test-2",
    });
    const view = viewFor([BASE_MODULE], state, "a");
    const vertex = verticesOfHex(state.board.tiles[0]!.hex)[0]!;

    const viewWithSettlement = {
      ...view,
      buildings: new Map([[vertex.id, { playerId: "a", type: "settlement" as const }]]),
    };

    const onVertexClick = vi.fn();
    const { container } = render(
      <HexBoard
        view={viewWithSettlement}
        playerColors={{ a: "#f00", b: "#00f" }}
        legalVertexIds={new Set()}
        onVertexClick={onVertexClick}
      />,
    );

    const clickableGroup = [...container.querySelectorAll("g")].find(
      (g) => (g as unknown as { onclick: unknown }).onclick,
    );
    expect(clickableGroup).toBeFalsy();
  });
});
