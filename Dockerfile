# Prepo's web app, as a self-contained image.
#
# The runtime is Next's `standalone` output, not a checkout with node_modules:
# `apps/web/.next/standalone` carries the server and the traced production
# dependencies. `public/` and `.next/static/` are copied beside it because the
# standalone server serves them itself.
#
# Audio is on a mounted volume (`/data`), because the storage driver in this
# repository is the local filesystem (ADR 0005). Without the volume, a redeploy
# loses every recording; `DEPLOYMENT.md` says so where an operator will read it.

FROM node:22-alpine AS base
RUN npm install -g pnpm@12.11.2
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @prepo/web build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    AUDIO_STORAGE_DIR=/data/audio \
    AUDIO_STAGING_DIR=/data/incoming

RUN apk add --no-cache su-exec \
    && mkdir -p /data/audio /data/incoming \
    && chown -R node:node /data

WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
