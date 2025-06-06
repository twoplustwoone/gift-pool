# Contributor Guidelines

This repository contains the GiftPool web application built with Remix, Express and TypeScript. The following notes describe the project structure and the expected workflow when contributing code.

## Development
- **Node version:** 20 (see `package.json` `engines` field).
- Use `npm run dev` to start the development server.
- Icon assets under `app/components/ui/icons` are generated. Run `npm run build:icons` to update them.
- Run `npm run build` to create a production build.

## Testing
- Unit tests are written with Vitest and end‑to‑end tests use Playwright.
- To run all checks (tests, linting, type checks, e2e) execute `npm run validate`.
- If Playwright is missing, install browsers with `npm run test:e2e:install`.
- Mocks for external services live in `tests/mocks` and are powered by MSW.

## Linting and Formatting
- ESLint and Prettier configuration come from `@epic-web/config`.
- Format code with `npm run format` and lint with `npm run lint` before committing.

## Database
- Prisma manages the SQLite schema. Run `npm run setup` to build the project, generate the client, apply migrations and seed data.

## Repository Layout
- `app/` – Remix routes, components and utilities.
- `server/` – Express entry points.
- `prisma/` – Database schema and migrations.
- `tests/` – Vitest and Playwright tests.
- `other/` – Additional scripts and build helpers. See `other/README.md` for details.

## Additional Notes
- `public/favicons` explains favicon usage and `tests/mocks/README.md` documents the mock server setup.
- Keep miscellaneous files out of the project root when possible by placing them in `other/`.
