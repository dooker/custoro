# syntax=docker/dockerfile:1
# Build context: apps/api
#   dev:  docker compose up           (target: dev, source bind-mounted)
#   prod: docker compose -f docker-compose.prod.yml up -d --build   (target: prod)

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# --- Development: all dependencies, source comes from the bind mount
FROM base AS dev
COPY package.json package-lock.json .npmrc ./
RUN npm ci
ENV NODE_ENV=development
EXPOSE 3999
CMD ["npm", "run", "dev"]

# --- Build: compile TypeScript
FROM dev AS build
COPY . .
RUN npm run build

# --- Production dependencies only
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
# i18next lists typescript as an optional peer, so --omit=dev alone keeps it (~23 MB).
# --omit=optional drops it the npm way. The only other optional package in the tree is
# the oxc-parser native binding behind @sentry/node's vite/rollup/webpack/esbuild
# entry points, which this app never imports.
RUN npm ci --omit=dev --omit=optional

# --- Production runtime
FROM base AS prod
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY locales ./locales
# uploads/ (public files) and storage/ (invoice PDFs) are volumes; the app also writes
# .env.email into its working dir
RUN mkdir -p uploads storage/pdf && chown -R node:node /app
USER node
EXPOSE 3999
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
    CMD node -e "fetch('http://localhost:3999/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
