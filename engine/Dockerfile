# ── Idswyft Engine Worker — Multi-stage build ────────────────────
# Stage 1: install deps, download models, build shared package, compile TypeScript
# Stage 2: slim runtime with only what's needed to run ML inference
#
# This image is ~1.5GB due to ML dependencies (TensorFlow, ONNX, PaddleOCR).
# It runs as a separate container from the core API, which stays ~250MB.
#
# Build context must be the repo root (set in docker-compose.build.yml):
#   docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
# ─────────────────────────────────────────────────────

# ── Stage 1: Build ──────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Native build dependencies (needed to compile canvas, sharp, onnxruntime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace root + package manifests (for npm workspace resolution)
COPY package.json ./
COPY shared/package.json shared/
COPY engine/package.json engine/

# Install all dependencies (npm workspaces resolves @idswyft/shared)
RUN npm install --include=optional

# Copy pre-generated models (e.g., deepfake-detector.onnx from export script)
COPY shared/models/ shared/models/

# Download face detection model weights
COPY engine/download-models.js engine/
RUN cd engine && node download-models.js

# Build shared package first (engine depends on it)
COPY shared/src/ shared/src/
COPY shared/tsconfig.json shared/
RUN cd shared && npx tsc && npx tsc-alias

# Copy engine source and compile TypeScript
COPY engine/src/ engine/src/
COPY engine/tsconfig.json engine/
RUN cd engine && npx tsc && npx tsc-alias

# Strip devDependencies — only production deps go to runtime stage
RUN npm prune --omit=dev

# ── Stage 2: Runtime ────────────────────────────────
FROM node:20-slim
WORKDIR /app/engine

# Runtime-only native libraries (no compilers)
# - libcairo2, libpango, libjpeg, libgif, librsvg: for canvas
# - libstdc++6: for onnxruntime-node (already in node:20-slim)
# - wget: for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    librsvg2-2 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with home directory (PaddleOCR caches models in ~/.cache)
RUN groupadd -r nodeuser && useradd -r -g nodeuser -m -s /bin/false nodeuser \
    && mkdir -p /home/nodeuser/.cache/ppu-paddle-ocr \
    && chown -R nodeuser:nodeuser /home/nodeuser

# Copy compiled output preserving workspace structure for @idswyft/shared resolution
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/engine/dist ./dist
COPY --from=build /app/engine/models ./models
COPY --from=build /app/shared/dist /app/shared/dist
COPY --from=build /app/shared/models /app/shared/models
COPY --from=build /app/shared/package.json /app/shared/package.json
COPY --from=build /app/engine/package.json ./package.json

RUN chown -R nodeuser:nodeuser /app
USER nodeuser

EXPOSE 3002

CMD ["node", "dist/server.js"]
