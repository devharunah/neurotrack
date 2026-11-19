import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test as setup } from "@playwright/test";

/**
 * Signs the E2E user in once through the real login form and saves the session, which every
 * signed-in spec then reuses (see `storageState` in playwright.config.ts). One sign-in per run
 * instead of one per test keeps parallel workers clear of Supabase's auth rate limits.
 */
export const AUTH_FILE = "e2e/.auth/user.json";

const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];

setup("sign in the E2E user", async ({ page }) => {
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  if (!email || !password) {
    // Signed-in specs skip themselves; leave them an empty, valid session file.
    writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  await page.goto("/login?next=/dashboard");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Match the pathname, not the URL: "/login?next=/dashboard" also ends in "/dashboard".
  await page.waitForURL((url) => url.pathname === "/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
