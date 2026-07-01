FROM oven/bun:1.3.9-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --registry=https://registry.npmjs.org

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN apk add --no-cache nodejs \
  && node node_modules/next/dist/bin/next build
RUN bun build worker/review-worker.ts --compile --outfile /app/.build/review-worker

FROM base AS web
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV OPENAI_BASE_URL=https://api.openai.com/v1
ENV PORT=3000

RUN apk add --no-cache nodejs

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:nodejs /app/.next/standalone ./
COPY --from=builder --chown=appuser:nodejs /app/.next/static ./.next/static
COPY --chown=appuser:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 755 ./docker-entrypoint.sh

USER appuser

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["web"]

FROM alpine:3.22 AS worker
WORKDIR /app

ENV NODE_ENV=production
ENV OPENAI_BASE_URL=https://api.openai.com/v1

RUN apk add --no-cache ca-certificates libgcc libstdc++ \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:nodejs /app/.build/review-worker ./review-worker
COPY --from=builder --chown=appuser:nodejs /app/.agents ./.agents
COPY --chown=appuser:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 755 ./docker-entrypoint.sh ./review-worker

USER appuser

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["worker"]
