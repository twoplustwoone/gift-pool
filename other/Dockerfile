# This file is moved to the root directory before building the image

# base node image
FROM node:20-bookworm-slim as base

# set for base and all layer that inherit from it
ENV NODE_ENV production

# Install openssl for Prisma
RUN apt-get update && \
  apt-get install --no-install-recommends -y \
    ca-certificates \
    fuse3 \
    openssl \
    sqlite3 && \
  rm -rf /var/lib/apt/lists/*

# Install all node_modules, including dev dependencies
FROM base as deps

WORKDIR /myapp

COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --ignore-scripts && npm rebuild esbuild better-sqlite3 sharp

# Setup production node_modules
FROM base as production-deps

WORKDIR /myapp

COPY --from=deps /myapp/node_modules /myapp/node_modules
COPY package.json package-lock.json .npmrc ./
RUN npm prune --omit=dev

# Build the app
FROM base as build

ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

# Use the following environment variables to configure Sentry
# ENV SENTRY_ORG=
# ENV SENTRY_PROJECT=


WORKDIR /myapp

COPY --from=deps /myapp/node_modules /myapp/node_modules
COPY package.json package-lock.json .npmrc components.json index.js postcss.config.js react-router.config.ts tailwind.config.ts tsconfig.json vite.config.ts ./
COPY app ./app
COPY prisma ./prisma
COPY public ./public
COPY server ./server
COPY types ./types
COPY other ./other

RUN npx prisma generate

# Mount the secret and set it as an environment variable and run the build
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
  export SENTRY_AUTH_TOKEN=$(cat /run/secrets/SENTRY_AUTH_TOKEN) && \
  npm run build

# Finally, build the production image with minimal footprint
FROM base

ENV FLY="true"
ENV LITEFS_DIR="/litefs/data"
ENV DATABASE_FILENAME="sqlite.db"
ENV DATABASE_PATH="$LITEFS_DIR/$DATABASE_FILENAME"
ENV DATABASE_URL="file:$DATABASE_PATH"
ENV CACHE_DATABASE_FILENAME="cache.db"
ENV CACHE_DATABASE_PATH="$LITEFS_DIR/$CACHE_DATABASE_FILENAME"
ENV INTERNAL_PORT="8080"
ENV PORT="8081"
ENV NODE_ENV="production"
# For WAL support: https://github.com/prisma/prisma-engines/issues/4675#issuecomment-1914383246
ENV PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK="1"

# Allow LiteFS to expose the FUSE mount to the non-root app process and add a
# shortcut for connecting to the database CLI.
RUN printf 'user_allow_other\n' >> /etc/fuse.conf && \
  echo "#!/bin/sh\nset -x\nsqlite3 \$DATABASE_URL" > /usr/local/bin/database-cli && \
  chmod +x /usr/local/bin/database-cli

WORKDIR /myapp

# Generate random value and save it to .env file which will be loaded by dotenv
RUN INTERNAL_COMMAND_TOKEN=$(openssl rand -hex 32) && \
  echo "INTERNAL_COMMAND_TOKEN=$INTERNAL_COMMAND_TOKEN" > .env

COPY --from=production-deps /myapp/node_modules /myapp/node_modules
COPY --from=build /myapp/node_modules/.prisma /myapp/node_modules/.prisma

COPY --from=build /myapp/server-build /myapp/server-build
COPY --from=build /myapp/build /myapp/build
COPY --from=build /myapp/index.js /myapp/index.js
COPY --from=build /myapp/package.json /myapp/package.json
COPY --from=build /myapp/prisma /myapp/prisma
COPY --from=build /myapp/public /myapp/public
COPY --from=build /myapp/app/components/ui/icons /myapp/app/components/ui/icons
# The daily occasion-reminder scheduled Machine runs this script from the
# same image (`--entrypoint "node other/trigger-occasion-reminders.js"`) —
# without this COPY it dies with MODULE_NOT_FOUND before POSTing the sweep.
COPY --from=build /myapp/other/trigger-occasion-reminders.js /myapp/other/trigger-occasion-reminders.js

# prepare for litefs
COPY --from=flyio/litefs:0.5.14 /usr/local/bin/litefs /usr/local/bin/litefs
COPY other/litefs.yml /etc/litefs.yml
RUN mkdir -p /data ${LITEFS_DIR} && chown -R node:node /myapp /data ${LITEFS_DIR}

CMD ["litefs", "mount"]
