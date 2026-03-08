# Repository Guidelines

## Project Structure & Module Organization

- `app/` is the React Router app: routes in `app/routes`, shared UI in `app/components`, hooks in `app/hooks`, and app logic in `app/utils`.
- `server/` contains runtime entry points (`server/index.ts`, `server/dev-server.js`) and server-only helpers.
- `prisma/` holds the SQLite schema, migrations, and seed script.
- `tests/` contains Playwright e2e tests (`tests/e2e`), Vitest setup (`tests/setup`), mocks/fixtures, and test databases (`tests/prisma`).
- `public/` stores static assets; `stories/` and `.storybook/` support Storybook; `other/` contains build/admin scripts.

## Build, Test, and Development Commands

- `npm run dev` - start local development server.
- `npm run build` - build icons, the React Router app, and server output.
- `npm run start` - run the production build locally.
- `npm run lint` / `npm run typecheck` - run ESLint and TypeScript checks.
- `npm run test` - run Vitest unit/component tests.
- `npm run test:e2e:run` - run Playwright e2e tests with CI-style env + test DB.
- `npm run validate` - run unit tests, lint, typecheck, and e2e together.

## Coding Style & Naming Conventions

- Use Node `20` (see `package.json` engines).
- Formatting is enforced by Prettier: 2 spaces, single quotes, semicolons, trailing commas (`npm run format`).
- Prefer `kebab-case` filenames for utilities in `app/utils` and `app/lib` (ESLint-enforced).
- Follow the flat-route naming already used in `app/routes` (example: `api.friends.requests.$id.accept.ts`).
- Co-locate tests with source when practical using `*.test.ts` / `*.test.tsx`.

## Testing Guidelines

- Unit/UI tests use Vitest + Testing Library; coverage is collected for `app/**/*.{ts,tsx}`.
- E2E tests use Playwright in `tests/e2e` (`*.test.ts` / `*.spec.ts`).
- For feature work, run `npm run test -- --run` and `npm run test:e2e:run` before opening a PR.
- Update or add tests when behavior, routes, or database flows change.

## Commit & Pull Request Guidelines

- Follow conventional commit style seen in history: `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`, `refactor(scope): ...`, `chore(scope): ...`.
- Keep commits focused and small; avoid mixing refactors with behavior changes.
- PRs should include: summary, test plan, updated checklist items, and UI screenshots/video for visual changes.
- Link related issues and call out migration/env changes explicitly.

## Security & Configuration Tips

- Copy `.env.example` to `.env` for local work; do not commit secrets.
- Run `npm run prisma:generate` after schema edits; use `npx prisma migrate deploy` when verifying migrations.
