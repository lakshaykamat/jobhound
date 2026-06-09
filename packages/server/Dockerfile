# syntax=docker/dockerfile:1.7

# Build context for this Dockerfile is the REPO ROOT, not packages/server.
# See docker-compose.yml and .github/workflows/docker.yml.

FROM node:22-slim AS builder
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json ./packages/server/
RUN pnpm install --frozen-lockfile --filter @jobhound/server...
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/server/src ./packages/server/src
RUN pnpm --filter @jobhound/server run build

FROM node:22-slim AS deploy
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json ./packages/server/
RUN pnpm install --frozen-lockfile --filter @jobhound/server...
COPY --from=builder /repo/packages/server/dist ./packages/server/dist
RUN pnpm deploy --filter @jobhound/server --prod /prod/server

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=UTC
COPY --from=deploy /prod/server ./
COPY packages/server/web ./web
EXPOSE 8787
CMD ["node", "dist/cli/server.js", "/app/config.json"]
