import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const PORT = process.env.PORT || '3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  webServer: {
    // Always use dev server for tests to avoid production cookie/security diffs
    command: 'npm run dev',
    port: Number(PORT),
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT,
      NODE_ENV: 'test',
      // Ensure MSW mocks are enabled even when running locally (non-CI)
      MOCKS: 'true',
      // Propagate DB/session env so server + tests share the same state
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_PATH: process.env.DATABASE_PATH,
      CACHE_DATABASE_PATH: process.env.CACHE_DATABASE_PATH,
      SESSION_SECRET: process.env.SESSION_SECRET,
      INTERNAL_COMMAND_TOKEN: process.env.INTERNAL_COMMAND_TOKEN,
    },
  },
});
