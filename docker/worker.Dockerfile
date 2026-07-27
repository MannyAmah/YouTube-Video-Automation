# MedExplained v2 — pipeline worker service (Node + Python/Manim animator)
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
# System deps:
#   ffmpeg           — render/probe/concat/mux
#   fonts-dejavu     — captions, thumbnails, Manim text
#   espeak-ng        — TEST_MODE narration only
#   python3 + venv   — the Manim animation engine
#   libcairo/pango + build tools — Manim + RDKit runtime/build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates ffmpeg fonts-dejavu espeak-ng \
    python3 python3-venv python3-dev \
    build-essential pkg-config \
    libcairo2-dev libpango1.0-dev \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
COPY services ./services

# Isolated Python venv for the animator (avoids the Debian setuptools patch).
RUN python3 -m venv /opt/animenv \
  && /opt/animenv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
  && /opt/animenv/bin/pip install --no-cache-dir -r services/animator/requirements.txt
ENV ANIMATOR_PYTHON=/opt/animenv/bin/python
ENV ANIMATOR_DIR=/app/services/animator

EXPOSE 3000
CMD ["node", "apps/worker/dist/main.js"]
