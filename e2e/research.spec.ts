import { type Page, expect, test } from "@playwright/test";

/**
 * Research Assistant: literature search, cited answers, saving with a note, and the library
 * full-text search. Signed-in tests are skipped unless E2E_USER_EMAIL and E2E_USER_PASSWORD are
 * set. They also need the API running (`pnpm dev:api`), the research migration applied, and
 * internet access to Europe PMC and PubMed, because the assistant searches them live.
 */
const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];

/** Live upstream searches can be slow; give them room without hiding a hang. */
const LIVE = { timeout: 45_000 };
const QUERY = "dopamine reward prediction error";

/** The session comes from e2e/auth.setup.ts: open the page and confirm we were not bounced. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, "\\$&")}`));
}

async function searchLiterature(page: Page, query: string) {
  await page.getByRole("tab", { name: "Search literature" }).click();
  await page.getByRole("searchbox", { name: "Search terms" }).fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: /results? for/ })).toBeVisible(LIVE);
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visitors are sent to login from the Research Assistant", async ({ page }) => {
    await page.goto("/research");
    await expect(page).toHaveURL(/\/login\?next=%2Fresearch/);
    await page.goto("/research/saved");
    await expect(page).toHaveURL(/\/login\?next=%2Fresearch%2Fsaved/);
  });
});

test.describe("signed in", () => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");

  test("the page explains evidence labels as types, not grades", async ({ page }) => {
    await open(page, "/research");
    await expect(page.getByRole("heading", { name: "Literature", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);
    const legend = page.getByTestId("evidence-legend");
    await legend.getByText("What do the evidence labels mean?").click();
    await expect(legend).toContainText("not a quality grade");
  });

  test("search shows references with evidence, abstract and original links", async ({ page }) => {
    await open(page, "/research");
    await searchLiterature(page, QUERY);
    await expect(page).toHaveURL(/mode=search&q=dopamine/);

    const first = page.getByTestId("results").getByTestId("reference-card").first();
    await expect(first.getByTestId("evidence-badge")).toBeVisible();
    await expect(first.getByRole("link", { name: /Europe PMC/ })).toHaveAttribute(
      "href",
      /^https:\/\/europepmc\.org\//,
    );
    const abstract = first.getByText("Abstract", { exact: true });
    if (await abstract.isVisible()) {
      await abstract.click();
    }
    // The query is recorded in the user's own history.
    await expect(page.getByTestId("query-history")).toContainText(QUERY);
  });

  test("save a reference with a note, find it on the saved page, then unsave it", async ({
    page,
  }) => {
    await open(page, "/research");
    await searchLiterature(page, QUERY);
    const unsaved = page
      .getByTestId("reference-card")
      .filter({ has: page.getByRole("button", { name: "Save", exact: true }) })
      .first();
    const title = (await unsaved.getByRole("heading").textContent())?.trim() ?? "";
    expect(title.length).toBeGreaterThan(0);
    // Pin the card by its title: once saved it no longer matches the "has a Save button" filter.
    const card = page
      .getByTestId("reference-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .first();

    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByText("Saved to your library.")).toBeVisible();
    await card.getByRole("button", { name: "Add note" }).click();
    const note = `e2e note ${Date.now()}`;
    await card.getByLabel("Your note (private)").fill(note);
    await card.getByRole("button", { name: "Save note" }).click();
    await expect(card.getByText(`Note: ${note}`)).toBeVisible();

    await open(page, "/research/saved");
    const saved = page.getByTestId("saved-references").getByTestId("reference-card").filter({
      hasText: note,
    });
    await expect(saved).toHaveCount(1);
    await expect(saved.getByRole("heading")).toHaveText(title);

    await saved.getByRole("button", { name: "Unsave" }).click();
    await expect(page.getByText(note)).toHaveCount(0);
  });

  test("ask a question: cited answer, clickable markers, provider and disclaimer", async ({
    page,
  }) => {
    await open(page, "/research");
    await page.getByRole("tab", { name: "Ask a question" }).click();
    await page
      .getByRole("searchbox", { name: "Your question" })
      .fill("How do dopamine neurons signal reward prediction errors?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    const answer = page.getByTestId("answer");
    await expect(answer).toBeVisible(LIVE);
    await expect(page.getByTestId("answer-provider")).toContainText(/Extractive|Ollama/);
    await expect(page.getByTestId("removed-unsupported")).toBeVisible();
    await expect(page.getByTestId("answer-disclaimer")).toContainText("not medical advice");

    const markers = page.getByTestId("citation-marker");
    expect(await markers.count()).toBeGreaterThan(0);
    const marker = markers.first();
    const href = await marker.getAttribute("href");
    expect(href).toMatch(/^#source-\d+$/);
    await marker.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    const target = page.locator(href ?? "#missing");
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport();
  });

  test("library search finds references cached by an earlier search", async ({ page }) => {
    await open(page, "/research");
    await searchLiterature(page, QUERY);
    await page.getByRole("tab", { name: "Search my library" }).click();
    await page.getByRole("searchbox", { name: "Search terms" }).fill("dopamine");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: /in the library for/ })).toBeVisible(LIVE);
    expect(await page.getByTestId("reference-card").count()).toBeGreaterThan(0);
  });

  test("a shared link runs its query on arrival", async ({ page }) => {
    await page.goto(`/research?mode=search&q=${encodeURIComponent("craving sleep")}`);
    await expect(page.getByRole("heading", { name: /results? for “craving sleep”/ })).toBeVisible(
      LIVE,
    );
  });
});
