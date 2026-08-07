FROM node:24.6.0-alpine3.22 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV VITE_API_BASE=/kca-api
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29.0-alpine3.22

COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

ENV KCA_PROXY_TARGET=https://kca-proxy.juisemobility.com \
    NGINX_ENVSUBST_FILTER=KCA_PROXY_TARGET

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health/live || exit 1
