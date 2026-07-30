# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/mirror/docker/library/node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_API_URL is baked in at build time for client bundles.
# Pass it as a build arg so we can set it when building the image.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/mirror/docker/library/node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1

# Copy the self-contained standalone bundle
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Ensure public dir exists (Next.js expects it even if empty)
RUN mkdir -p public

EXPOSE 8080

CMD ["node", "server.js"]
