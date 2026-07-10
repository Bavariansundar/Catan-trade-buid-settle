import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Two-browser multiplayer smoke test: both players register, one creates a
 * public lobby, the other joins, both ready up, the host starts the game,
 * and both browsers land on the live game table. See PROMPTS.md Phase 9.
 * Runs against apps/server's in-memory-backed e2e test server (see
 * apps/server/src/testServer.ts) — no live Postgres/Redis needed.
 */
test("two players can create a lobby, start a game, and both see the board", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const alice = await newPlayer(browser, "alice");
  const bob = await newPlayer(browser, "bob");

  try {
    await alice.page.goto("/lobbies");
    await alice.page.getByRole("button", { name: "Create Lobby" }).click();
    await expect(alice.page).toHaveURL(/\/lobby\//);
    const lobbyUrl = alice.page.url();

    await bob.page.goto("/lobbies");
    // The public lobby list may take a beat to reflect the new lobby.
    await expect(bob.page.getByRole("button", { name: "Join", exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await bob.page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(bob.page).toHaveURL(lobbyUrl);

    for (const p of [alice.page, bob.page]) {
      await p.getByRole("button", { name: "Ready" }).click();
    }

    await alice.page.getByRole("button", { name: "Start Game" }).click();

    for (const p of [alice.page, bob.page]) {
      await expect(p).toHaveURL(/\/game\//, { timeout: 15_000 });
      await expect(p.locator("svg[aria-label='Game board']")).toBeVisible({ timeout: 15_000 });
    }
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

async function newPlayer(
  browser: Browser,
  name: string,
): Promise<{ page: Page; context: Awaited<ReturnType<Browser["newContext"]>> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/register");
  const email = `${name}-${String(Date.now())}-${String(Math.random()).slice(2, 8)}@example.com`;
  await page.getByPlaceholder("Display name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder(/Password/).fill("password123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/lobbies/, { timeout: 10_000 });
  return { page, context };
}
