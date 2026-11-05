import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("landing introduces the archive and explicitly labels the sample entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/NYUAD|Yaqeim/);
  await expect(page.getByLabel("University email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request Access" })).toBeVisible();
  await page.getByRole("link", { name: /explore the sample archive/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/sample|fictional|demo/i).first()).toBeVisible();
});

test("dashboard exposes searchable text and exact tag filters", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByLabel("Search courses or professors").fill("zzzz-no-course-should-match");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=zzzz-no-course-should-match/);
  await expect(
    page.getByText(/no (matching )?(results|courses|reviews|matches)/i).first(),
  ).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("checkbox", { name: "Easy A", exact: true }).check();
  await page.getByRole("checkbox", { name: "Light Workload", exact: true }).check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const query = new URL(page.url()).searchParams;
  expect(query.getAll("tag")).toEqual(expect.arrayContaining(["Easy A", "Light Workload"]));
  await expect(page.getByRole("checkbox", { name: "Easy A", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Light Workload", exact: true })).toBeChecked();
  await expect(
    page.getByRole("link", { name: "Alex Morgan (sample)", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator('a[href="/professors/10000000-0000-4000-8000-000000000002"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('a[href="/professors/10000000-0000-4000-8000-000000000003"]'),
  ).toHaveCount(0);
});

test("search accepts course codes, titles and professor names", async ({ page }) => {
  for (const query of ["CS-UH 1001", "Introduction to Computer Science", "Alex Morgan"]) {
    await page.goto(`/dashboard?q=${encodeURIComponent(query)}`);
    await expect(page.getByLabel("Search courses or professors")).toHaveValue(query);
    await expect(
      page.getByRole("link", { name: "Alex Morgan (sample)", exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/professors/10000000-0000-4000-8000-000000000002"]'),
    ).toHaveCount(0);
  }
});

test("professor and course pages expose comparable metrics and review context", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const professorLink = page.locator('a[href^="/professors/"]').first();
  const professorName = await professorLink.innerText();
  await professorLink.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(professorName);
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByText(/overall/i).first()).toBeVisible();
  await expect(page.getByText(/workload/i).first()).toBeVisible();
  await expect(page.getByText(/grading/i).first()).toBeVisible();
  await page.locator('a[href^="/courses/"]').first().click();
  await expect(page).toHaveURL(/\/courses\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.locator('a[href^="/professors/"]').first()).toBeVisible();
});

test("review form validates text and makes sample writes truthful", async ({ page }) => {
  await page.goto("/submit");
  await page.getByLabel("Professor", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Course", { exact: true }).selectOption({ index: 2 });
  const selectedCourse = await page.getByLabel("Course", { exact: true }).inputValue();
  await expect(page.getByLabel("Post anonymously")).toBeChecked();
  await page.getByLabel("Review text").fill("Useful class.");
  await page.getByRole("button", { name: "Submit review", exact: true }).click();
  expect(
    await page
      .getByLabel("Review text")
      .evaluate((element: HTMLTextAreaElement) => element.checkValidity()),
  ).toBe(false);

  const draftText = "A clear and thoughtful fictional review for testing the sample archive form.";
  await page.getByLabel("Review text").fill(draftText);
  await page.getByRole("button", { name: "Submit review", exact: true }).click();
  await expect(
    page
      .getByText(
        /not (saved|stored|persisted)|nothing.*saved|demo.*(read.only|preview)|sample.*(read.only|not saved)/i,
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Success: Your review has been recorded.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Course", { exact: true })).toHaveValue(selectedCourse);
  await expect(page.getByLabel("Review text")).toHaveValue(draftText);
});

test("terms and missing records have readable routes", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/terms|privacy/i);
  await page.goto("/professors/00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByText(/not found|could not (find|be found)|does not exist/i).first(),
  ).toBeVisible();
  const response = await page.goto("/professors/not-a-uuid");
  // Next.js retains HTTP 200 once the loading boundary has begun streaming.
  // https://nextjs.org/docs/app/api-reference/file-conventions/not-found
  expect([200, 404]).toContain(response?.status());
  await expect(
    page.getByText(/not found|could not (find|be found)|does not exist/i).first(),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator("table")).toHaveCount(0);
});

test("sample helpful votes never imply persistence", async ({ page }) => {
  await page.goto("/professors/10000000-0000-4000-8000-000000000001");
  const vote = page.getByRole("button", { name: /^Helpful \(/ }).first();
  const original = await vote.innerText();
  await vote.click();
  await expect(page.getByText("Sample archive: votes are not saved.").first()).toBeVisible();
  await expect(vote).toHaveText(original);
  await expect(vote).toHaveAttribute("aria-pressed", "false");
});

test("imported dates and missing legacy ratings remain explicit", async ({ page }) => {
  await page.goto("/professors/10000000-0000-4000-8000-000000000001?sort=newest");
  const imported = page.locator("article.review").filter({ hasText: "Archive import" }).first();
  await expect(imported).toContainText("Imported on: 2026-09-16");
  await expect(imported).toContainText("Workload: Not reported");
  await expect(imported).toContainText("Grading difficulty: Not reported");
});

test("the archive fits the viewport and retains the specified reading design", async ({
  page,
}, testInfo) => {
  await mkdir(".local/screenshots", { recursive: true });
  for (const [name, route] of [
    ["landing", "/"],
    ["dashboard", "/dashboard"],
    ["submit", "/submit"],
    ["terms", "/terms"],
    ["professor", "/professors/10000000-0000-4000-8000-000000000001"],
  ]) {
    await page.goto(route);
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      background: getComputedStyle(document.body).backgroundColor,
      family: getComputedStyle(document.body).fontFamily,
      headingFamily: getComputedStyle(document.querySelector("h1")!).fontFamily,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.background).toBe("rgb(249, 248, 246)");
    expect(layout.family).toMatch(/Verdana/i);
    expect(layout.headingFamily).toMatch(/Georgia/i);
    await expect(page.locator('a[href="/terms"]').first()).toBeVisible();
    await page.screenshot({
      path: `.local/screenshots/${testInfo.project.name}-${name}.png`,
      fullPage: true,
    });
  }
});
