# syntax=docker/dockerfile:1.7

FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=UTC
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=builder /app/dist ./dist
COPY web ./web
EXPOSE 8787
CMD ["node", "dist/cli/server.js", "/app/config.json"]
