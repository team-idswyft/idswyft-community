FROM node:20-slim AS base
WORKDIR /app

# Native build dependencies for sharp, canvas (face recognition), and onnxruntime-node
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

# Download face-api.js model weights at build time (not committed to repo)
COPY download-models.js ./
RUN node download-models.js

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
