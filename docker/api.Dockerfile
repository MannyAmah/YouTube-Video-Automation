# MedExplained v2 — API + dashboard service
# Build context: repository root. On Railway set RAILWAY_DOCKERFILE_PATH=docker/api.Dockerfile
FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json nx.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yva/db exec prisma generate \
  && pnpm --filter @yva/shared build \
  && pnpm --filter @yva/db build \
  && pnpm --filter @yva/research build \
  && pnpm --filter @yva/providers build \
  && pnpm --filter @yva/media build \
  && pnpm --filter @yva/api build \
  && pnpm --filter @yva/web build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
# Serve the built dashboard from the API process.
ENV WEB_DIST=/app/apps/web/dist
EXPOSE 3000
# Apply migrations, ensure the admin user/channel exist, then start the API.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma && node packages/db/dist/seed.js && node apps/api/dist/main.js"]
