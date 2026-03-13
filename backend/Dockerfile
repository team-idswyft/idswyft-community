FROM node:20-alpine AS base
# Cache bust: 2026-03-13
WORKDIR /app

# Native build dependencies for sharp (image processing) and canvas (face recognition)
# libc6-compat provides glibc compatibility (ld-linux-x86-64.so.2) needed by onnxruntime-node
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    libc6-compat

COPY package*.json ./
RUN npm install --include=optional

# Download face-api.js model weights at build time (not committed to repo)
COPY download-models.js ./
RUN node download-models.js

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
