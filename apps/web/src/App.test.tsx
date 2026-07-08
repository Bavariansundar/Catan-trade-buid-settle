import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("web scaffold", () => {
  it("renders the app shell", () => {
    render(<App />);
    expect(screen.getByText("Hexhaven")).toBeInTheDocument();
  });
});
