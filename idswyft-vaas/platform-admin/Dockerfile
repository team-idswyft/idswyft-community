# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Install serve to serve the built files
RUN npm install -g serve

# Expose port
EXPOSE 3001

# Health check — use Railway-injected PORT
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/ || exit 1

# Serve the built application on Railway-injected PORT
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3001}"]
