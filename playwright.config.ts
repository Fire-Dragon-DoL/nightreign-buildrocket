import { defineConfig } from '@playwright/test';

// E2E tests run against the BUILT single-file app (dist/index.html) opened
// over file://, which is exactly how users run it. Run `pnpm build` first.
// They use the locally installed Google Chrome (channel "chrome"), since
// Chrome is the only supported browser.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
});
