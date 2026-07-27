# MedExplained v2 — pipeline worker service
# Build context: repository root. On Railway set RAILWAY_DOCKERFILE_PATH=docker/worker.Dockerfile
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
  && pnpm --filter @yva/worker build

FROM node:22-slim
# ffmpeg: rendering/probing. fonts-dejavu: captions/thumbnails.
# espeak-ng: TEST_MODE narration only (harmless in production).
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates ffmpeg fonts-dejavu espeak-ng \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "apps/worker/dist/main.js"]
