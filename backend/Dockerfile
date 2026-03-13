FROM node:20-alpine AS base
WORKDIR /app

# Native build dependencies for sharp (image processing) and canvas (face recognition)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev

COPY package*.json ./
RUN npm ci --include=optional

# Download face-api.js model weights at build time (not committed to repo)
COPY download-models.js ./
RUN node download-models.js

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
