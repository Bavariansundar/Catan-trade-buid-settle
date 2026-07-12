import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("web app shell", () => {
  it("renders the header/nav", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("BayCheArsBar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rules" })).toBeInTheDocument();
  });
});
