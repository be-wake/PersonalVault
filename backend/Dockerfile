# pg (node-postgres) is pure JavaScript — no native addons, no build tools needed.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 8080

CMD ["node", "src/server.js"]
