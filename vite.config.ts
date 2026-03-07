import path from 'path';
import { reactRouter } from '@react-router/dev/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { glob } from 'glob';
import { defineConfig } from 'vite';
import { envOnlyMacros } from 'vite-env-only';

const MODE = process.env.NODE_ENV;
const IS_STORYBOOK = Boolean(process.env.STORYBOOK);
const IS_VITEST = Boolean(process.env.VITEST);

export default defineConfig({
  optimizeDeps: {
    // Pre-bundle Radix Popover and related deps to avoid
    // Vite's runtime re-optimization causing 504 (Outdated Optimize Dep)
    include: [
      '@radix-ui/react-popover',
      '@radix-ui/react-popper',
      '@radix-ui/react-portal',
      '@radix-ui/react-dismissable-layer',
      '@radix-ui/react-primitive',
      '@floating-ui/react-dom',
      '@floating-ui/dom',
    ],
  },
  resolve: {
    alias: {
      '#app': path.resolve(__dirname, 'app'),
      '#tests': path.resolve(__dirname, 'tests'),
    },
    // Prevent multiple React copies in dev which can cause
    // "Invalid hook call. Hooks can only be called inside of the body of a function component"
    // when HMR loads modules from different dependency graphs.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    cssMinify: MODE === 'production',

    rollupOptions: {
      external: [/node:.*/, 'fsevents'],
    },

    assetsInlineLimit: (source: string) => {
      if (
        source.endsWith('sprite.svg') ||
        source.endsWith('favicon.svg') ||
        source.endsWith('apple-touch-icon.png')
      ) {
        return false;
      }
    },

    sourcemap: true,
  },
  server: {
    watch: {
      ignored: ['**/playwright-report/**'],
    },
  },
  plugins: [
    envOnlyMacros(),
    // it would be really nice to have this enabled in tests, but we'll have to
    // wait until https://github.com/remix-run/remix/issues/9871 is fixed
    process.env.NODE_ENV === 'test' || IS_VITEST || IS_STORYBOOK
      ? null
      : reactRouter(),
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          disable: MODE !== 'production',
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          release: {
            name: process.env.COMMIT_SHA,
            setCommits: {
              auto: true,
            },
          },
          sourcemaps: {
            filesToDeleteAfterUpload: await glob([
              './build/**/*.map',
              '.server-build/**/*.map',
            ]),
          },
        })
      : null,
  ],
  test: {
    include: ['./app/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup/setup-test-env.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    restoreMocks: true,
    coverage: {
      include: ['app/**/*.{ts,tsx}'],
      all: true,
    },
  },
});
