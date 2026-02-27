FROM node:20-alpine

WORKDIR /app

COPY services/frontend-prototype/package.json ./package.json
COPY services/frontend-prototype/src ./src
COPY services/frontend-prototype/public ./public

EXPOSE 3000

CMD ["node", "src/server.js"]
