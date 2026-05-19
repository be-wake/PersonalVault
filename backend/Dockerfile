# ── Stage 1: build (needs Python + C++ for better-sqlite3 native addon) ───────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# ── Stage 2: runtime (no build tools) ─────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Persistent SQLite data directory
RUN mkdir -p /home/data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src          ./src
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080

CMD ["node", "src/server.js"]
