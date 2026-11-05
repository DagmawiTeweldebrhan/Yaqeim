import { defineConfig, devices } from "@playwright/test";

const samplePort = Number(process.env.PLAYWRIGHT_SAMPLE_PORT || 3000);
const privatePort = Number(process.env.PLAYWRIGHT_PRIVATE_PORT || 3001);
if (
  [samplePort, privatePort].some(
    (port) => !Number.isInteger(port) || port < 1024 || port > 65535,
  ) ||
  samplePort === privatePort
) {
  throw new Error("Browser tests require two distinct ports between 1024 and 65535.");
}
const sampleOrigin = `http://127.0.0.1:${samplePort}`;
const privateOrigin = `http://127.0.0.1:${privatePort}`;

const commonEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  UNIVERSITY_EMAIL_DOMAIN: "nyu.edu",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "archive-desktop",
      testMatch: "archive.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: sampleOrigin },
    },
    {
      name: "archive-mobile",
      testMatch: "archive.spec.ts",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        baseURL: sampleOrigin,
      },
    },
    {
      name: "authentication-boundary",
      testMatch: "authentication.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: privateOrigin },
    },
  ],
  webServer: [
    {
      command: `npm run start -- --port ${samplePort}`,
      url: sampleOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...commonEnv, NEXT_PUBLIC_SITE_URL: sampleOrigin, DEMO_MODE: "true" },
    },
    {
      command: `npm run start -- --port ${privatePort}`,
      url: privateOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...commonEnv, NEXT_PUBLIC_SITE_URL: privateOrigin, DEMO_MODE: "false" },
    },
  ],
});
