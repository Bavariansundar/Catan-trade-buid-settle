import { describe, expect, it } from "vitest";
import { botsPlaceholder } from "./index.js";

describe("bots scaffold", () => {
  it("depends on the engine package", () => {
    expect(botsPlaceholder()).toBe("bots+engine");
  });
});
