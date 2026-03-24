# ── Stage 1: Build ─────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Native build dependencies for sharp, canvas, and onnxruntime-node
# Using slim (Debian) instead of Alpine because onnxruntime-node requires full glibc
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
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --include=optional

# Download face detection model weights at build time
COPY download-models.js ./
RUN node download-models.js

COPY . .
RUN npm run build

# Remove dev dependencies and node_modules/.bin symlinks
# (.bin contains CLI wrappers like tsc/vitest — not needed at runtime,
#  and symlinks there break Docker Desktop on Windows)
RUN npm prune --omit=dev && rm -rf node_modules/.bin

# ── Stage 2: Runtime ───────────────────────────────────
FROM node:20-slim
WORKDIR /app

# Runtime-only native libraries (canvas needs cairo/pango at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    librsvg2-2 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled output, models, and pruned production node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/models ./models
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/supabase ./supabase

EXPOSE 3001

CMD ["node", "dist/server.js"]
