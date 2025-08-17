# Gift Pool - Agent Development Guide

## Project Overview

Gift Pool is a Remix-based web application for managing wishlists and gift groups. Built with TypeScript, React, Prisma (SQLite), and Tailwind CSS.

### Key Technologies

- **Framework**: Remix (Full-stack React framework)
- **Database**: Prisma with SQLite
- **Styling**: Tailwind CSS with Radix UI components
- **Authentication**: remix-auth with GitHub OAuth
- **Testing**: Vitest (unit), Playwright (E2E)
- **Deployment**: Fly.io with LiteFS for distributed SQLite

### Folder Structure

```
app/                    # Main application code
├── components/         # React components
│   ├── ui/            # Reusable UI components (buttons, inputs, etc.)
│   ├── ui-kit/        # Layout components (Box, Flex, Stack, etc.)
│   └── wishlist/      # Wishlist-specific components
├── routes/            # Remix routes (file-based routing)
│   ├── _auth+/        # Authentication routes
│   ├── groups+/       # Gift group management
│   ├── wishlist+/     # Wishlist management
│   └── users+/        # User profiles
├── utils/             # Server and client utilities
└── styles/            # CSS and styling

prisma/                # Database schema and migrations
tests/                 # Test files and utilities
other/                 # Build scripts and Docker configuration
```

## Development Commands

### Setup

```bash
./setup.sh             # Initial project setup (run once)
```

### Development Server

```bash
npm run dev             # Start development server (http://localhost:3000)
```

### Build

```bash
npm run build           # Build for production
npm run start           # Start production server
```

### Code Quality

```bash
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint issues automatically
npm run format          # Format code with Prettier
npm run typecheck       # TypeScript type checking
```

### Testing

```bash
npm test                # Run unit tests (Vitest)
npm run coverage        # Run tests with coverage
npm run test:e2e        # Run E2E tests (Playwright UI mode)
npm run test:e2e:run    # Run E2E tests (headless)
```

### Database

```bash
npm run prisma:studio   # Open Prisma Studio (database GUI)
npx prisma migrate dev  # Create and apply new migration
npx prisma db seed      # Seed database with test data
```

### Verification Commands

Run these to ensure everything is working correctly:

```bash
npm run validate        # Run all checks (tests, lint, typecheck, e2e)
npm run typecheck       # Verify TypeScript compilation
npm run lint            # Check code style
npm test -- --run       # Run unit tests once
```

## Development Conventions

### TypeScript

- **Strict mode enabled** - All TypeScript strict checks are enforced
- **Path aliases**: Use `#app/*` for app code, `#tests/*` for test utilities
- **Type imports**: Prefer `import type` for type-only imports

### Code Style

- **Formatting**: Prettier with Tailwind plugin for class sorting
- **Components**: Use arrow functions for React components
- **File naming**: kebab-case for files, PascalCase for components

### Database

- **Migrations**: Always create migrations for schema changes
- **Seeding**: Use `prisma/seed.ts` for test data
- **Relations**: Properly define Prisma relations with cascade deletes

### Testing

- **Unit tests**: Place `.test.tsx` files alongside components
- **E2E tests**: Use `tests/e2e/` directory
- **Mocks**: MSW for API mocking in tests

### Environment Variables

- **Required secrets**: Must be set in production (see setup.sh for list)
- **Development**: Use .env file created by setup.sh
- **Public vars**: Only expose necessary vars to client (see `getEnv()` in env.server.ts)

### Security Notes

- **Session secrets**: Generate strong random values for production
- **GitHub OAuth**: Configure real client ID/secret for authentication
- **Database**: SQLite with LiteFS for production distribution
- **CSRF protection**: Honeypot and session-based protection enabled

### Git Workflow

- **Commits**: Use conventional commit format
- **Branches**: Feature branches from main
- **Testing**: All tests must pass before merge

## External Dependencies

### Required for Full Functionality

- **GitHub OAuth app** (for authentication)
- **Resend account** (for email features)
- **Sentry project** (for error tracking)

### Optional Services

- **Fly.io account** (for deployment)
- **LiteFS** (for distributed SQLite in production)

## Troubleshooting

### Common Issues

1. **Database locked**: Stop dev server, delete `.db` files, re-run setup
2. **Port conflicts**: Change PORT in .env or stop other services on port 3000
3. **Playwright failures**: Run `npx playwright install --with-deps`
4. **Type errors**: Run `npx prisma generate` to update Prisma client

### Development Tips

- Use `npm run dev` for hot reloading
- Check `app/utils/env.server.ts` for required environment variables
- Use Prisma Studio for database inspection
- MSW mocks are enabled in test environment automatically
