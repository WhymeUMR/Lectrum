FROM node:20-alpine AS build
ARG SERVICE_PATH
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services ./services

RUN npm ci
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
