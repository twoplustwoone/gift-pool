// vite.config.ts
import { vitePlugin as remix } from "file:///Users/twoplustwoone/code/personal/web/gift-pool/node_modules/@remix-run/dev/dist/index.js";
import { sentryVitePlugin } from "file:///Users/twoplustwoone/code/personal/web/gift-pool/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
import { glob } from "file:///Users/twoplustwoone/code/personal/web/gift-pool/node_modules/glob/dist/esm/index.js";
import { flatRoutes } from "file:///Users/twoplustwoone/code/personal/web/gift-pool/node_modules/remix-flat-routes/dist/index.js";
import { defineConfig } from "file:///Users/twoplustwoone/code/personal/web/gift-pool/node_modules/vite/dist/node/index.js";
import { envOnlyMacros } from "file:///Users/twoplustwoone/code/personal/web/gift-pool/node_modules/vite-env-only/dist/index.js";
var MODE = process.env.NODE_ENV;
var vite_config_default = defineConfig({
  build: {
    cssMinify: MODE === "production",
    rollupOptions: {
      external: [/node:.*/, "fsevents"]
    },
    assetsInlineLimit: (source) => {
      if (source.endsWith("sprite.svg") || source.endsWith("favicon.svg") || source.endsWith("apple-touch-icon.png")) {
        return false;
      }
    },
    sourcemap: true
  },
  server: {
    watch: {
      ignored: ["**/playwright-report/**"]
    }
  },
  plugins: [
    envOnlyMacros(),
    // it would be really nice to have this enabled in tests, but we'll have to
    // wait until https://github.com/remix-run/remix/issues/9871 is fixed
    process.env.NODE_ENV === "test" ? null : remix({
      ignoredRouteFiles: ["**/*"],
      serverModuleFormat: "esm",
      routes: async (defineRoutes) => {
        return flatRoutes("routes", defineRoutes, {
          ignoredRouteFiles: [
            ".*",
            "**/*.css",
            "**/*.test.{js,jsx,ts,tsx}",
            "**/__*.*",
            // This is for server-side utilities you want to colocate
            // next to your routes without making an additional
            // directory. If you need a route that includes "server" or
            // "client" in the filename, use the escape brackets like:
            // my-route.[server].tsx
            "**/*.server.*",
            "**/*.client.*"
          ]
        });
      }
    }),
    process.env.SENTRY_AUTH_TOKEN ? sentryVitePlugin({
      disable: MODE !== "production",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      release: {
        name: process.env.COMMIT_SHA,
        setCommits: {
          auto: true
        }
      },
      sourcemaps: {
        filesToDeleteAfterUpload: await glob([
          "./build/**/*.map",
          ".server-build/**/*.map"
        ])
      }
    }) : null
  ],
  test: {
    include: ["./app/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup/setup-test-env.ts"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    restoreMocks: true,
    coverage: {
      include: ["app/**/*.{ts,tsx}"],
      all: true
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvdHdvcGx1c3R3b29uZS9jb2RlL3BlcnNvbmFsL3dlYi9naWZ0LXBvb2xcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy90d29wbHVzdHdvb25lL2NvZGUvcGVyc29uYWwvd2ViL2dpZnQtcG9vbC92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvdHdvcGx1c3R3b29uZS9jb2RlL3BlcnNvbmFsL3dlYi9naWZ0LXBvb2wvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyB2aXRlUGx1Z2luIGFzIHJlbWl4IH0gZnJvbSAnQHJlbWl4LXJ1bi9kZXYnO1xuaW1wb3J0IHsgc2VudHJ5Vml0ZVBsdWdpbiB9IGZyb20gJ0BzZW50cnkvdml0ZS1wbHVnaW4nO1xuaW1wb3J0IHsgZ2xvYiB9IGZyb20gJ2dsb2InO1xuaW1wb3J0IHsgZmxhdFJvdXRlcyB9IGZyb20gJ3JlbWl4LWZsYXQtcm91dGVzJztcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHsgZW52T25seU1hY3JvcyB9IGZyb20gJ3ZpdGUtZW52LW9ubHknO1xuXG5jb25zdCBNT0RFID0gcHJvY2Vzcy5lbnYuTk9ERV9FTlY7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIGJ1aWxkOiB7XG4gICAgY3NzTWluaWZ5OiBNT0RFID09PSAncHJvZHVjdGlvbicsXG5cbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBleHRlcm5hbDogWy9ub2RlOi4qLywgJ2ZzZXZlbnRzJ10sXG4gICAgfSxcblxuICAgIGFzc2V0c0lubGluZUxpbWl0OiAoc291cmNlOiBzdHJpbmcpID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgc291cmNlLmVuZHNXaXRoKCdzcHJpdGUuc3ZnJykgfHxcbiAgICAgICAgc291cmNlLmVuZHNXaXRoKCdmYXZpY29uLnN2ZycpIHx8XG4gICAgICAgIHNvdXJjZS5lbmRzV2l0aCgnYXBwbGUtdG91Y2gtaWNvbi5wbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgc291cmNlbWFwOiB0cnVlLFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICB3YXRjaDoge1xuICAgICAgaWdub3JlZDogWycqKi9wbGF5d3JpZ2h0LXJlcG9ydC8qKiddLFxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICBlbnZPbmx5TWFjcm9zKCksXG4gICAgLy8gaXQgd291bGQgYmUgcmVhbGx5IG5pY2UgdG8gaGF2ZSB0aGlzIGVuYWJsZWQgaW4gdGVzdHMsIGJ1dCB3ZSdsbCBoYXZlIHRvXG4gICAgLy8gd2FpdCB1bnRpbCBodHRwczovL2dpdGh1Yi5jb20vcmVtaXgtcnVuL3JlbWl4L2lzc3Vlcy85ODcxIGlzIGZpeGVkXG4gICAgcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICd0ZXN0J1xuICAgICAgPyBudWxsXG4gICAgICA6IHJlbWl4KHtcbiAgICAgICAgICBpZ25vcmVkUm91dGVGaWxlczogWycqKi8qJ10sXG4gICAgICAgICAgc2VydmVyTW9kdWxlRm9ybWF0OiAnZXNtJyxcbiAgICAgICAgICByb3V0ZXM6IGFzeW5jIChkZWZpbmVSb3V0ZXMpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBmbGF0Um91dGVzKCdyb3V0ZXMnLCBkZWZpbmVSb3V0ZXMsIHtcbiAgICAgICAgICAgICAgaWdub3JlZFJvdXRlRmlsZXM6IFtcbiAgICAgICAgICAgICAgICAnLionLFxuICAgICAgICAgICAgICAgICcqKi8qLmNzcycsXG4gICAgICAgICAgICAgICAgJyoqLyoudGVzdC57anMsanN4LHRzLHRzeH0nLFxuICAgICAgICAgICAgICAgICcqKi9fXyouKicsXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBmb3Igc2VydmVyLXNpZGUgdXRpbGl0aWVzIHlvdSB3YW50IHRvIGNvbG9jYXRlXG4gICAgICAgICAgICAgICAgLy8gbmV4dCB0byB5b3VyIHJvdXRlcyB3aXRob3V0IG1ha2luZyBhbiBhZGRpdGlvbmFsXG4gICAgICAgICAgICAgICAgLy8gZGlyZWN0b3J5LiBJZiB5b3UgbmVlZCBhIHJvdXRlIHRoYXQgaW5jbHVkZXMgXCJzZXJ2ZXJcIiBvclxuICAgICAgICAgICAgICAgIC8vIFwiY2xpZW50XCIgaW4gdGhlIGZpbGVuYW1lLCB1c2UgdGhlIGVzY2FwZSBicmFja2V0cyBsaWtlOlxuICAgICAgICAgICAgICAgIC8vIG15LXJvdXRlLltzZXJ2ZXJdLnRzeFxuICAgICAgICAgICAgICAgICcqKi8qLnNlcnZlci4qJyxcbiAgICAgICAgICAgICAgICAnKiovKi5jbGllbnQuKicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICBwcm9jZXNzLmVudi5TRU5UUllfQVVUSF9UT0tFTlxuICAgICAgPyBzZW50cnlWaXRlUGx1Z2luKHtcbiAgICAgICAgICBkaXNhYmxlOiBNT0RFICE9PSAncHJvZHVjdGlvbicsXG4gICAgICAgICAgYXV0aFRva2VuOiBwcm9jZXNzLmVudi5TRU5UUllfQVVUSF9UT0tFTixcbiAgICAgICAgICBvcmc6IHByb2Nlc3MuZW52LlNFTlRSWV9PUkcsXG4gICAgICAgICAgcHJvamVjdDogcHJvY2Vzcy5lbnYuU0VOVFJZX1BST0pFQ1QsXG4gICAgICAgICAgcmVsZWFzZToge1xuICAgICAgICAgICAgbmFtZTogcHJvY2Vzcy5lbnYuQ09NTUlUX1NIQSxcbiAgICAgICAgICAgIHNldENvbW1pdHM6IHtcbiAgICAgICAgICAgICAgYXV0bzogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzb3VyY2VtYXBzOiB7XG4gICAgICAgICAgICBmaWxlc1RvRGVsZXRlQWZ0ZXJVcGxvYWQ6IGF3YWl0IGdsb2IoW1xuICAgICAgICAgICAgICAnLi9idWlsZC8qKi8qLm1hcCcsXG4gICAgICAgICAgICAgICcuc2VydmVyLWJ1aWxkLyoqLyoubWFwJyxcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pXG4gICAgICA6IG51bGwsXG4gIF0sXG4gIHRlc3Q6IHtcbiAgICBpbmNsdWRlOiBbJy4vYXBwLyoqLyoudGVzdC57dHMsdHN4fSddLFxuICAgIHNldHVwRmlsZXM6IFsnLi90ZXN0cy9zZXR1cC9zZXR1cC10ZXN0LWVudi50cyddLFxuICAgIGdsb2JhbFNldHVwOiBbJy4vdGVzdHMvc2V0dXAvZ2xvYmFsLXNldHVwLnRzJ10sXG4gICAgcmVzdG9yZU1vY2tzOiB0cnVlLFxuICAgIGNvdmVyYWdlOiB7XG4gICAgICBpbmNsdWRlOiBbJ2FwcC8qKi8qLnt0cyx0c3h9J10sXG4gICAgICBhbGw6IHRydWUsXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFrVSxTQUFTLGNBQWMsYUFBYTtBQUN0VyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFFOUIsSUFBTSxPQUFPLFFBQVEsSUFBSTtBQUV6QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixPQUFPO0FBQUEsSUFDTCxXQUFXLFNBQVM7QUFBQSxJQUVwQixlQUFlO0FBQUEsTUFDYixVQUFVLENBQUMsV0FBVyxVQUFVO0FBQUEsSUFDbEM7QUFBQSxJQUVBLG1CQUFtQixDQUFDLFdBQW1CO0FBQ3JDLFVBQ0UsT0FBTyxTQUFTLFlBQVksS0FDNUIsT0FBTyxTQUFTLGFBQWEsS0FDN0IsT0FBTyxTQUFTLHNCQUFzQixHQUN0QztBQUNBLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUFBLElBRUEsV0FBVztBQUFBLEVBQ2I7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFNBQVMsQ0FBQyx5QkFBeUI7QUFBQSxJQUNyQztBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLGNBQWM7QUFBQTtBQUFBO0FBQUEsSUFHZCxRQUFRLElBQUksYUFBYSxTQUNyQixPQUNBLE1BQU07QUFBQSxNQUNKLG1CQUFtQixDQUFDLE1BQU07QUFBQSxNQUMxQixvQkFBb0I7QUFBQSxNQUNwQixRQUFRLE9BQU8saUJBQWlCO0FBQzlCLGVBQU8sV0FBVyxVQUFVLGNBQWM7QUFBQSxVQUN4QyxtQkFBbUI7QUFBQSxZQUNqQjtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxZQU1BO0FBQUEsWUFDQTtBQUFBLFVBQ0Y7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRixDQUFDO0FBQUEsSUFDTCxRQUFRLElBQUksb0JBQ1IsaUJBQWlCO0FBQUEsTUFDZixTQUFTLFNBQVM7QUFBQSxNQUNsQixXQUFXLFFBQVEsSUFBSTtBQUFBLE1BQ3ZCLEtBQUssUUFBUSxJQUFJO0FBQUEsTUFDakIsU0FBUyxRQUFRLElBQUk7QUFBQSxNQUNyQixTQUFTO0FBQUEsUUFDUCxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ2xCLFlBQVk7QUFBQSxVQUNWLE1BQU07QUFBQSxRQUNSO0FBQUEsTUFDRjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1YsMEJBQTBCLE1BQU0sS0FBSztBQUFBLFVBQ25DO0FBQUEsVUFDQTtBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNGLENBQUMsSUFDRDtBQUFBLEVBQ047QUFBQSxFQUNBLE1BQU07QUFBQSxJQUNKLFNBQVMsQ0FBQywwQkFBMEI7QUFBQSxJQUNwQyxZQUFZLENBQUMsaUNBQWlDO0FBQUEsSUFDOUMsYUFBYSxDQUFDLCtCQUErQjtBQUFBLElBQzdDLGNBQWM7QUFBQSxJQUNkLFVBQVU7QUFBQSxNQUNSLFNBQVMsQ0FBQyxtQkFBbUI7QUFBQSxNQUM3QixLQUFLO0FBQUEsSUFDUDtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
