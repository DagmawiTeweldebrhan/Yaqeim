import { expect, test } from "@playwright/test";

test("a real deployment without credentials does not offer the demo bypass", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Sign-in is temporarily unavailable. Please try again later."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /explore the sample archive/i })).toHaveCount(0);
});

for (const path of [
  "/dashboard",
  "/submit",
  "/reviews",
  "/reviews/30000000-0000-4000-8000-000000000001/edit",
  "/professors/10000000-0000-4000-8000-000000000001",
  "/courses/20000000-0000-4000-8000-000000000001",
]) {
  test(`unauthenticated access is rejected for ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response).not.toBeNull();
    const status = response!.status();
    if (status >= 400) {
      expect([401, 403, 404, 503]).toContain(status);
    } else {
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(
        page.getByText("Sign-in is temporarily unavailable. Please try again later."),
      ).toBeVisible();
    }
    await expect(page.locator("table")).toHaveCount(0);
  });
}

test("direct HTTP requests authenticate before validating private record IDs", async ({
  request,
  baseURL,
}) => {
  for (const path of [
    "/professors/not-a-uuid",
    "/courses/not-a-uuid",
    "/reviews/not-a-uuid/edit",
    "/reviews/30000000-0000-4000-8000-000000000001/edit",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect([303, 307]).toContain(response.status());
    const destination = new URL(response.headers().location, baseURL);
    expect(destination.pathname).toBe("/");
    expect(await response.text()).not.toMatch(
      /Alex Morgan|Anonymous student|professor_id|course_id/,
    );
  }
});

test("missing backend credentials do not invite an email request or claim delivery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Sign-in is temporarily unavailable. Please try again later."),
  ).toBeVisible();
  await expect(page.getByLabel("University email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request Access" })).toHaveCount(0);
  await expect(page.getByText(/check your (email|inbox)/i)).toHaveCount(0);
});

test("authentication callback cannot redirect to an untrusted origin", async ({
  page,
  baseURL,
}) => {
  await page.goto("/auth/callback?next=https%3A%2F%2Fevil.example");
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
});
