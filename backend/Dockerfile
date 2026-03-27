# ── Idswyft API — Multi-stage build ──────────────────
# Stage 1: install deps, compile TypeScript
# Stage 2: slim runtime with only what's needed to run
#
# ML dependencies (TensorFlow, ONNX, PaddleOCR, canvas) have been moved
# to the Engine Worker container. This image is now lightweight (~250MB).
#
# For local builds:
#   docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
# ─────────────────────────────────────────────────────

# ── Stage 1: Build ──────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Minimal build dependencies (sharp uses pre-built binaries, no native build needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies (including devDependencies for build)
# NOTE: Using `npm install` (not `npm ci`) because the lockfile may drift
# on Windows dev machines with platform-specific optional deps (esbuild, rollup).
# Regenerate lockfile with `npm install --package-lock-only` if switching to npm ci.
COPY package*.json ./
RUN npm install --include=optional

# Copy source and compile TypeScript
COPY . .
RUN npx tsc && npx tsc-alias

# Strip devDependencies — only production deps go to runtime stage
RUN npm prune --omit=dev

# ── Stage 2: Runtime ────────────────────────────────
FROM node:20-slim
WORKDIR /app

# Runtime: only wget for health checks (sharp pre-built binaries are self-contained)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r nodeuser && useradd -r -g nodeuser -s /bin/false nodeuser

# Copy compiled output + node_modules from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Entrypoint: auto-migrate then start server
# sed converts Windows CRLF → LF (git on Windows may check out with \r\n)
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

# Migrations are bind-mounted from supabase/migrations/ at runtime
ENV MIGRATIONS_DIR=/app/migrations

RUN chown -R nodeuser:nodeuser /app
USER nodeuser

EXPOSE 3001

CMD ["sh", "./docker-entrypoint.sh"]
