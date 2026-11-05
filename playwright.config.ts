import { defineConfig, devices } from "@playwright/test";

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
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3000" },
    },
    {
      name: "archive-mobile",
      testMatch: "archive.spec.ts",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        baseURL: "http://127.0.0.1:3000",
      },
    },
    {
      name: "authentication-boundary",
      testMatch: "authentication.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3001" },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --port 3000",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...commonEnv, NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000", DEMO_MODE: "true" },
    },
    {
      command: "npm run start -- --port 3001",
      url: "http://127.0.0.1:3001",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...commonEnv, NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3001", DEMO_MODE: "false" },
    },
  ],
});
