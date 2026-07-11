import { expect, test } from "@playwright/test";

/**
 * Drives a complete offline single-player game (human vs one EASY
 * RuleBasedBot) purely through the rendered UI. Each step runs as a single
 * in-page `evaluate()` (rather than a chain of Playwright locator round
 * trips) so thousands of turn-actions don't drown in per-call overhead;
 * it prefers City > Settlement > Road > Buy Dev Card > End Turn during the
 * main phase to make steady VP progress. See PROMPTS.md Phase 9.
 */
test("plays a single-player game vs a bot to a decided winner", async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto("/play");
  await page.getByLabel("Players").selectOption("2");
  await page.getByLabel("Bot difficulty").selectOption("EASY");
  await page.getByRole("button", { name: "Start New Game" }).click();

  await expect(page.locator("svg[aria-label='Game board']")).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < 20_000; i++) {
    const status = await page.evaluate(driveOneStep);
    if (status === "done") break;
    if (status === "idle") await page.waitForTimeout(15);
  }

  await expect(page.getByText(/wins!/).first()).toBeVisible();
});

/** Runs entirely in the browser; returns "done" | "acted" | "idle". Kept as a plain function (no closures) so it can cross the evaluate() boundary. */
function driveOneStep(): "done" | "acted" | "idle" {
  const byText = (root: ParentNode, pattern: RegExp): HTMLElement | null =>
    [...root.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.children.length === 0 && pattern.test(el.textContent ?? ""),
    ) ?? null;
  const buttonNamed = (pattern: RegExp): HTMLButtonElement | null =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      pattern.test(b.textContent ?? ""),
    ) ?? null;
  const click = (el: Element): void => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  if (byText(document.body, /wins!/)) return "done";

  // --- Discard (7 rolled, hand > 7) ---
  const cards = [...document.querySelectorAll<HTMLElement>(".hh-card")];
  const discardCard = cards.find((c) =>
    /^Discard \d+ cards/.test(c.querySelector("h3")?.textContent ?? ""),
  );
  if (discardCard) {
    const heading = discardCard.querySelector("h3")?.textContent ?? "";
    const owed = Number(/Discard (\d+)/.exec(heading)?.[1] ?? "0");
    const selected = Number(/\((\d+)\//.exec(heading)?.[1] ?? "0");
    if (selected < owed) {
      const resourceButtons = [...discardCard.querySelectorAll("button")].filter((b) =>
        b.textContent?.includes(":"),
      );
      const w = window as unknown as { __discardIdx?: number };
      w.__discardIdx = (w.__discardIdx ?? 0) + 1;
      if (resourceButtons.length > 0)
        click(resourceButtons[w.__discardIdx % resourceButtons.length]!);
      return "acted";
    }
    (window as unknown as { __discardIdx?: number }).__discardIdx = 0;
    const discardButton = [...discardCard.querySelectorAll("button")].find(
      (b) => b.textContent === "Discard",
    );
    if (discardButton) {
      click(discardButton);
      return "acted";
    }
  }

  // --- Setup phase / general building: legal vertex/edge highlights ---
  const vertex = document.querySelector('svg circle[fill="var(--hh-accent)"]');
  if (vertex) {
    click(vertex);
    return "acted";
  }

  // --- Robber (mandatory move, or a played Knight) ---
  const robberPrompt = byText(document.body, /Move the robber|Playing Knight/);
  const robberHexGroup = [...document.querySelectorAll("svg g")].find((g) =>
    g.querySelector("polygon[stroke-dasharray]"),
  );
  if (robberPrompt && robberHexGroup) {
    click(robberHexGroup);
    return "acted";
  }
  const victimCard = cards.find((c) => c.textContent?.includes("Choose who to steal from"));
  const victimButton = victimCard?.querySelector("button");
  if (victimButton) {
    click(victimButton);
    return "acted";
  }

  // --- Roll ---
  const rollButton = buttonNamed(/^Roll Dice$/);
  if (rollButton) {
    click(rollButton);
    return "acted";
  }

  // --- Main phase: toggle Build City/Settlement/Road, then let the next tick click the highlighted piece ---
  const cityButton = buttonNamed(/^Build City$/);
  if (cityButton && !cityButton.disabled) {
    click(cityButton);
    return "acted";
  }
  const settlementButton = buttonNamed(/^Build Settlement$/);
  if (settlementButton && !settlementButton.disabled) {
    click(settlementButton);
    return "acted";
  }
  // Check for an already-highlighted edge BEFORE re-toggling Build Road — canBuildRoad
  // doesn't care whether road-mode is already active, so checking the toggle button
  // first (as this used to) causes an endless on/off toggle that never reaches an edge.
  const edge = document.querySelector('svg line[stroke="var(--hh-accent)"]');
  if (edge) {
    click(edge);
    return "acted";
  }
  const roadButton = buttonNamed(/^Build Road$/);
  if (roadButton && !roadButton.disabled) {
    click(roadButton);
    return "acted";
  }
  const buyDevCard = buttonNamed(/^Buy \(/);
  if (buyDevCard && !buyDevCard.disabled) {
    click(buyDevCard);
    return "acted";
  }

  // --- Nothing productive to do: end the turn (or wait for the bot's turn to resolve) ---
  const endTurnButton = buttonNamed(/^End Turn$/);
  if (endTurnButton) {
    click(endTurnButton);
    return "acted";
  }

  return "idle";
}
