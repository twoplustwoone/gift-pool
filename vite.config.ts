import path from 'path';
import { reactRouter } from '@react-router/dev/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { envOnlyMacros } from 'vite-env-only';
import { defineConfig } from 'vitest/config';

const MODE = process.env.NODE_ENV;
const IS_STORYBOOK = Boolean(process.env.STORYBOOK);
const IS_VITEST = Boolean(process.env.VITEST);

export default defineConfig({
  optimizeDeps: {
    // Pre-bundle Radix Popover and related deps to avoid
    // Vite's runtime re-optimization causing 504 (Outdated Optimize Dep)
    include: [
      // All Radix UI packages used in the app — pre-bundled together so they
      // all share the same Vite dep hash and the same React instance.
      // Adding any new Radix import? Add it here too, or it will lazy-load
      // separately and trigger "Cannot read properties of null (reading 'useMemo')".
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-popper',
      '@radix-ui/react-portal',
      '@radix-ui/react-dismissable-layer',
      '@radix-ui/react-primitive',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-tooltip',
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
            // Manual, not `auto`: the Docker build context excludes .git, so
            // auto-detection has no repository to read.
            setCommits: process.env.COMMIT_SHA
              ? {
                  repo: 'twoplustwoone/gift-pool',
                  commit: process.env.COMMIT_SHA,
                  ignoreMissing: true,
                }
              : undefined,
          },
          // The plugin's default is to throw and stop the build. Release
          // metadata and source maps are worth a warning, never a blocked
          // deploy.
          errorHandler: (error) => {
            console.warn('[sentry-vite-plugin] continuing build:', error);
          },
          sourcemaps: {
            // Patterns, resolved by the plugin after the build. Pre-globbing
            // here ran at config load, before any map existed, so nothing was
            // ever deleted. other/Dockerfile also deletes maps unconditionally.
            filesToDeleteAfterUpload: [
              './build/**/*.map',
              './server-build/**/*.map',
            ],
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
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
