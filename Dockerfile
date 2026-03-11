# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files and Prisma schema first for layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDeps for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src/

RUN npm run build

# ─── Stage 2: Production runner ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

# Install Chromium, Xvfb and required system libraries for puppeteer-real-browser
# Xvfb provides a virtual display so the browser runs in "headed" mode,
# which is essential for bypassing Cloudflare/Turnstile bot detection.
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell chrome-launcher (used by puppeteer-real-browser) where Chromium is
ENV CHROMIUM_PATH=/usr/bin/chromium

# Set timezone to Italian time
ENV TZ=Europe/Rome

WORKDIR /app

# Create non-root user for security
RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home appuser

# Copy package files, Prisma schema, and config
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install production dependencies only
RUN npm ci --omit=dev

# Re-generate Prisma client in production image
RUN npx prisma generate

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist/

# Copy entrypoint script
COPY docker-entrypoint.sh ./

# Create output and WhatsApp session dirs and give ownership to non-root user
RUN mkdir -p output .wwebjs_auth && chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
