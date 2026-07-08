import { describe, expect, it } from "vitest";
import { placeholder } from "./index.js";

describe("engine scaffold", () => {
  it("exposes a placeholder export", () => {
    expect(placeholder()).toBe("engine");
  });
});
