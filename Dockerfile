# ============================================
# Sakura API — Dockerfile for Railway
# ============================================
# Build from monorepo root:
#   docker build -f apps/api/Dockerfile .
# ============================================

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# ---- Install dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json

# Copy prisma schema so postinstall (prisma generate) works
COPY packages/database/prisma packages/database/prisma

RUN pnpm install --frozen-lockfile

# ---- Production image ----
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY apps/api apps/api
COPY packages/database packages/database
COPY packages/shared packages/shared
COPY package.json pnpm-workspace.yaml tsconfig.json ./

EXPOSE 4000

# Run prisma migrate on start, then start the API
CMD ["sh", "-c", "cd packages/database && npx prisma migrate deploy && cd /app && pnpm --filter @sakura/api start"]

