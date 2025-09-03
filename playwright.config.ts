import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

// Ensure required env + test DB defaults so `npx playwright test` works standalone
const ROOT = process.cwd();
const PORT = process.env.PORT || '3000';
process.env.NODE_ENV ||= 'test';
process.env.SESSION_SECRET ||= 'SESSION_SECRET';
process.env.INTERNAL_COMMAND_TOKEN ||= 'INTERNAL_COMMAND_TOKEN';
process.env.HONEYPOT_SECRET ||= 'HONEYPOT_SECRET';
process.env.SENTRY_DSN ||= 'disabled';

const BASE_DB_PATH = path.join(ROOT, 'tests/prisma/base.db');
const DATA_DB_PATH =
  process.env.DATABASE_PATH || path.join(ROOT, 'tests/prisma/data.1.db');
const CACHE_DB_PATH =
  process.env.CACHE_DATABASE_PATH || path.join(ROOT, 'tests/prisma/cache.db');

// Prepare test databases if not already set up
try {
  // Make sure tests/prisma exists (repo includes it, but keep this safe)
  fs.mkdirSync(path.dirname(DATA_DB_PATH), { recursive: true });
  if (fs.existsSync(BASE_DB_PATH)) {
    // Always start from a clean copy for reliability
    fs.copyFileSync(BASE_DB_PATH, DATA_DB_PATH);
  } else {
    // If base.db is missing, ensure the target file at least exists
    fs.writeFileSync(DATA_DB_PATH, '');
  }
  // Touch the cache DB file
  if (!fs.existsSync(CACHE_DB_PATH)) {
    fs.writeFileSync(CACHE_DB_PATH, '');
  }
} catch (e) {
  // Do not crash config loading if filesystem ops fail in CI; server may still start

  console.warn('[playwright.config] DB prep warning:', e);
}

process.env.DATABASE_PATH ||= DATA_DB_PATH;
process.env.CACHE_DATABASE_PATH ||= CACHE_DB_PATH;
process.env.DATABASE_URL ||= `file:${process.env.DATABASE_PATH}`;

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
      NODE_ENV: process.env.NODE_ENV,
      // Ensure MSW mocks are enabled even when running locally (non-CI)
      MOCKS: 'true',
      // Propagate DB/session env so server + tests share the same state
      DATABASE_URL: process.env.DATABASE_URL!,
      DATABASE_PATH: process.env.DATABASE_PATH!,
      CACHE_DATABASE_PATH: process.env.CACHE_DATABASE_PATH!,
      SESSION_SECRET: process.env.SESSION_SECRET!,
      INTERNAL_COMMAND_TOKEN: process.env.INTERNAL_COMMAND_TOKEN!,
      HONEYPOT_SECRET: process.env.HONEYPOT_SECRET!,
      SENTRY_DSN: process.env.SENTRY_DSN!,
    },
  },
});
