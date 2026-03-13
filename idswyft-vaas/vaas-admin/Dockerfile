# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Vite embeds VITE_* vars at build time — must be declared as ARGs
ARG VITE_API_URL
ARG VITE_NODE_ENV
ARG VITE_MOCK_AUTH_ENABLED
ARG VITE_API_TIMEOUT

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application (VITE_* ARGs become env vars during build)
RUN npm run build

# Install serve to serve the built files
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Health check — use Railway-injected PORT
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/ || exit 1

# Serve the built application on Railway-injected PORT
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]