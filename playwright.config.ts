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
    command: process.env.CI ? 'npm run start:mocks' : 'npm run dev',
    port: Number(PORT),
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PORT,
      // Deliberately NOT setting NODE_ENV=test. `vite.config.ts` drops the
      // reactRouter() plugin under NODE_ENV=test (so Vitest/Storybook can
      // import the app), which leaves Vite in its default `appType: "spa"`
      // with a terminal 404 middleware mounted ahead of the React Router
      // handler — every route, including /login, 404s. CI never noticed
      // because `start:mocks` re-sets NODE_ENV=production via cross-env, so
      // this only ever broke local runs.
      //
      // Ensure MSW mocks are enabled even when running locally (non-CI)
      MOCKS: 'true',
    },
  },
});
