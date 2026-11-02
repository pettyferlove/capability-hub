# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
RUN npm install --global pnpm@10.33.0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./
COPY packages packages
COPY apps apps
COPY scripts scripts
COPY skills skills
COPY tests tests
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @capability-hub/server deploy --prod /out/server

FROM node:24.22.1-bookworm-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/server ./
COPY --from=build /workspace/apps/web/dist ./web
COPY --from=build /workspace/dist/operations ./scripts/
COPY --from=build /workspace/scripts/operations/healthcheck.mjs ./scripts/healthcheck.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production CAPABILITY_HUB_HOST=0.0.0.0 PORT=4100 \
    CAPABILITY_HUB_DATA_DIR=/app/data CAPABILITY_HUB_WEB_DIR=/app/web
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "dist/main.js"]
