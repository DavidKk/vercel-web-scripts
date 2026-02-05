import { defineConfig, devices } from '@playwright/test'

/**
 * Read https://playwright.dev/docs/test-configuration for more information
 */
export default defineConfig({
  testDir: './__webtests__',
  /* Fail if a single test runs longer than this (avoids hanging forever) */
  timeout: 60_000,
  expect: { timeout: 10_000 },
  /* Maximum number of tests to run in parallel */
  fullyParallel: true,
  /* Retry in CI if test fails */
  retries: process.env.CI ? 2 : 0,
  /* CI: 1 worker. Local: 2 workers to avoid preset load timeouts under high concurrency */
  workers: process.env.CI ? 1 : 2,
  /* Test reporter configuration */
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'test-results/results.json' }]] : [['list'], ['html', { open: 'never' }]],
  /* Shared test configuration */
  use: {
    headless: true,
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    /* Screenshot configuration */
    screenshot: 'only-on-failure',
    /* Video configuration */
    video: 'retain-on-failure',
    /* Base URL, allows using relative paths in tests */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
  },

  /* Only run Chromium by default (you only need `pnpm test:e2e:install`). Use PLAYWRIGHT_TEST_ALL_BROWSERS=true to run firefox + webkit. */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true },
    },
    ...(process.env.PLAYWRIGHT_TEST_ALL_BROWSERS === 'true' && !process.env.CI
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],

  /* Run local development server - E2E Demo */
  webServer: {
    command: 'pnpm dev:e2e',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
