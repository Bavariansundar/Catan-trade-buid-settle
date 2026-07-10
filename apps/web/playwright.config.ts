import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3002;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run test:e2e-server",
      cwd: "../server",
      port: API_PORT,
      reuseExistingServer: false,
      env: { PORT: String(API_PORT) },
      timeout: 30_000,
    },
    {
      command: `npx vite --port ${String(WEB_PORT)}`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${String(API_PORT)}` },
      timeout: 30_000,
    },
  ],
});
