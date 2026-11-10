# syntax=docker/dockerfile:1.7
#
# Reveal panel plugin (sparkanswers-reveal-panel) - multi-stage build.
#
#   deps     : install npm dependencies (node:22-alpine)
#   build    : typecheck + lint + unit tests + production webpack build
#   dist     : FROM scratch, only /dist  -> export with
#              docker build --target dist --output type=local,dest=./out .
#   runtime  : Grafana 13.x with the plugin and demo provisioning baked in ->
#              docker build --target runtime -t reveal-grafana .
#
# Build args:
#   SKIP_CHECKS=1      skip typecheck/lint/test in the build stage
#   GRAFANA_IMAGE      grafana | grafana-enterprise   (default: grafana)
#   GRAFANA_VERSION    tag on hub.docker.com/r/grafana/<image> (default: 13.3.0)

ARG NODE_IMAGE=node:22-alpine
ARG GRAFANA_IMAGE=grafana
ARG GRAFANA_VERSION=13.3.0

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV CI=true \
    npm_config_update_notifier=false \
    npm_config_fund=false
# .npmrc carries ignore-scripts=true (supply-chain hardening); keep it alongside the manifests.
COPY package.json .npmrc package-lock.json* ./
# `npm ci` is the reproducible path and requires package-lock.json. Until the lockfile is
# committed we fall back to `npm install` so the image still builds.
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else echo "WARN: package-lock.json missing - using npm install"; npm install; fi

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
ARG SKIP_CHECKS=0
WORKDIR /app
# NODE_ENV is deliberately not set to production here: jest + React Testing Library need React's
# development build (act() is unavailable in production builds). Webpack's --env production flag
# already produces a production bundle.
ENV CI=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN if [ "$SKIP_CHECKS" = "1" ]; then \
      echo "SKIP_CHECKS=1 - skipping typecheck, lint and unit tests"; \
    else \
      npm run typecheck && npm run lint && npm run test:ci; \
    fi
RUN npm run build && test -f dist/plugin.json && test -f dist/module.js

# ---------------------------------------------------------------------------
FROM scratch AS dist
COPY --from=build /app/dist /dist

# ---------------------------------------------------------------------------
FROM grafana/${GRAFANA_IMAGE}:${GRAFANA_VERSION} AS runtime
LABEL org.opencontainers.image.title="Reveal panel demo (sparkanswers-reveal-panel)" \
      org.opencontainers.image.source="https://github.com/SparkAnswers/reveal" \
      org.opencontainers.image.licenses="Apache-2.0"

# Development/demo convenience ONLY. Do NOT expose this image publicly:
# anonymous visitors are organisation Admins.
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=sparkanswers-reveal-panel \
    GF_AUTH_ANONYMOUS_ENABLED=true \
    GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
    GF_AUTH_BASIC_ENABLED=false \
    GF_DEFAULT_APP_MODE=development \
    GF_LOG_FILTERS=plugin.sparkanswers-reveal-panel:debug

# Grafana images run as uid 472 (user "grafana"), gid 0.
COPY --from=build --chown=472:0 /app/dist /var/lib/grafana/plugins/sparkanswers-reveal-panel
COPY --chown=472:0 provisioning /etc/grafana/provisioning

EXPOSE 3000
