# ── Idswyft API — Single-stage build ──────────────────
# Single stage avoids the expensive cross-stage COPY of node_modules
# (~1-2GB) which is the main bottleneck on Windows Docker Desktop.
# BuildKit cache mounts persist npm/apt caches between builds.
FROM node:20-slim
WORKDIR /app

# Native build + runtime dependencies
# Using slim (Debian) instead of Alpine because onnxruntime-node requires full glibc
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    wget

# Install dependencies (cache mount keeps downloaded packages between builds)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --include=optional

# Download face detection model weights
COPY download-models.js ./
RUN node download-models.js

# Build the TypeScript source
COPY . .
RUN npm run build

# Remove .bin symlinks — they break Docker Desktop on Windows
# (containerd snapshotter can't extract symlinks during layer export)
RUN rm -rf node_modules/.bin

EXPOSE 3001

CMD ["node", "dist/server.js"]
