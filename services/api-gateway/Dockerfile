FROM node:20-alpine AS build
ARG SERVICE_PATH
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services ./services

RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 180000 \
  && npm config set foreground-scripts true \
  && for attempt in 1 2 3; do \
    npm ci --no-audit --no-fund && break; \
    echo "npm ci failed (attempt ${attempt}/3), retrying..." >&2; \
    rm -rf node_modules; \
    [ "$attempt" -eq 3 ] && exit 1; \
    sleep 3; \
  done
RUN npm run build --workspace @lecture/contracts
RUN npm run build --workspace @lecture/config
RUN npm run build --workspace @lecture/${SERVICE_PATH##services/}

FROM node:20-alpine AS runtime
ARG SERVICE_PATH
WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/${SERVICE_PATH}/dist ./service-dist
COPY --from=build /app/${SERVICE_PATH}/package.json ./service-package.json

EXPOSE 3000
CMD ["node", "service-dist/main.js"]
