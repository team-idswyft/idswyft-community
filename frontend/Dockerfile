FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Edition flag — defaults to community for self-hosted
ARG VITE_EDITION=community
# Optional: override API base URL (leave empty for same-origin via nginx proxy)
ARG VITE_API_URL

COPY . .
# Remove cloud .env.production so Docker builds use same-origin API (nginx proxy)
RUN rm -f .env.production
RUN npm run build

# Serve with nginx (non-root)
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
