import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env["CI"]);
// E2E_PORT lets a run use its own fresh build instead of reusing whatever already serves :3000
// (for example a `pnpm dev` from another checkout).
const customPort = process.env["E2E_PORT"];
const port = customPort ?? "3000";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${port}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: !isCI && !customPort,
  },
});
