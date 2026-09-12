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
    // WebKit renders real CSS/layout differently from Chromium (this is
    // what caught the missing-clamp class of bug this project pins), but it
    // is a desktop WebKit build under UA/viewport emulation, not literally
    // iOS — it does NOT reproduce an OS-native control's own intrinsic
    // sizing (e.g. `<input type="date">`'s wide min-content width on a real
    // iPhone; measured identical to Chromium here). Same limitation as the
    // vh/dvh gap this repo already documents: some mobile Safari bugs are
    // only visible on a real device. Scoped to just the mobile-layout spec
    // so the rest of the e2e suite doesn't run twice.
    {
      name: 'mobile-webkit',
      testMatch: /mobile-layout\.test\.ts$/,
      use: {
        ...devices['iPhone 13'],
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
      // This webServer always serves plain HTTP, but the CI path sets
      // NODE_ENV=production (see above), which would otherwise mark every
      // cookie `Secure` — WebKit (unlike Chromium) refuses to store a
      // `Secure` cookie on a non-HTTPS origin, silently losing the session
      // on the next navigation. Never set in a real deployment.
      INSECURE_COOKIES: 'true',
    },
  },
});
