# syntax=docker/dockerfile:1
# Build context: the repository root (set in both compose files), so the root CHANGELOG.md
# is available to the build. The image mirrors the repository layout under /app.
#   dev:  docker compose up           (target: dev, Vite dev server, source bind-mounted)
#   prod: docker compose -f docker-compose.prod.yml up -d --build   (target: prod, nginx)

FROM node:24-bookworm-slim AS base
WORKDIR /app/apps/web
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# --- Development: Vite dev server, source comes from the bind mount
FROM base AS dev
COPY apps/web/package.json apps/web/package-lock.json apps/web/.npmrc ./
RUN npm ci
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- Build static files
FROM dev AS build
COPY CHANGELOG.md /app/CHANGELOG.md
COPY apps/web/ ./
# Relative by default: nginx proxies /api to the API container (same origin, no CORS)
ARG VITE_API_ENDPOINT=/api
ENV VITE_API_ENDPOINT=$VITE_API_ENDPOINT
RUN npm run build

# --- Production: nginx serving the SPA and proxying the API
FROM nginx:1.29-alpine AS prod
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
