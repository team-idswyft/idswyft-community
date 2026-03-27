# ── Idswyft Engine Worker — Multi-stage build ────────────────────
# Stage 1: install deps, download models, compile TypeScript
# Stage 2: slim runtime with only what's needed to run ML inference
#
# This image is ~1.5GB due to ML dependencies (TensorFlow, ONNX, PaddleOCR).
# It runs as a separate container from the core API, which stays ~250MB.
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

# Install all dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm install --include=optional

# Download face detection model weights
COPY download-models.js ./
RUN node download-models.js

# Copy source and compile TypeScript
COPY . .
RUN npx tsc && npx tsc-alias

# Strip devDependencies — only production deps go to runtime stage
RUN npm prune --omit=dev

# ── Stage 2: Runtime ────────────────────────────────
FROM node:20-slim
WORKDIR /app

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

# Create non-root user
RUN groupadd -r nodeuser && useradd -r -g nodeuser -s /bin/false nodeuser

# Copy compiled output + node_modules + models from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/models ./models
COPY --from=build /app/package.json ./package.json

RUN chown -R nodeuser:nodeuser /app
USER nodeuser

EXPOSE 3002

CMD ["node", "dist/server.js"]
