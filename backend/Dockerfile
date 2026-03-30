# ── Idswyft API — Multi-stage build ──────────────────
# Stage 1: install deps, build shared package, compile TypeScript
# Stage 2: slim runtime with only what's needed to run
#
# ML dependencies (TensorFlow, ONNX, PaddleOCR, canvas) have been moved
# to the Engine Worker container. This image is now lightweight (~250MB).
#
# Build context must be the repo root (set in docker-compose.build.yml):
#   docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
# ─────────────────────────────────────────────────────

# ── Stage 1: Build ──────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Minimal build dependencies (sharp uses pre-built binaries, no native build needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace root + package manifests (for npm workspace resolution)
COPY package.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/

# Install all dependencies (npm workspaces resolves @idswyft/shared)
RUN npm install --include=optional

# Build shared package first (backend depends on it)
COPY shared/src/ shared/src/
COPY shared/tsconfig.json shared/
RUN cd shared && npx tsc && npx tsc-alias

# Copy backend source and compile TypeScript
COPY backend/src/ backend/src/
COPY backend/tsconfig.json backend/
RUN cd backend && npx tsc && npx tsc-alias

# Strip devDependencies — only production deps go to runtime stage
RUN npm prune --omit=dev

# ── Stage 2: Runtime ────────────────────────────────
FROM node:20-slim
WORKDIR /app/backend

# Runtime: only wget for health checks (sharp pre-built binaries are self-contained)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r nodeuser && useradd -r -g nodeuser -s /bin/false nodeuser

# Copy compiled output preserving workspace structure for @idswyft/shared resolution
# node_modules at /app/ contains hoisted deps + workspace symlink to /app/shared/
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/shared/dist /app/shared/dist
COPY --from=build /app/shared/package.json /app/shared/package.json
COPY --from=build /app/backend/package.json ./package.json

# Entrypoint: auto-migrate then start server
# sed converts Windows CRLF → LF (git on Windows may check out with \r\n)
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

# Migrations are bind-mounted from supabase/migrations/ at runtime
ENV MIGRATIONS_DIR=/app/backend/migrations

RUN chown -R nodeuser:nodeuser /app
USER nodeuser

EXPOSE 3001

CMD ["sh", "./docker-entrypoint.sh"]
