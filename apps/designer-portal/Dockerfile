# Simple full-monorepo Docker build for designer-portal
# This approach copies the entire monorepo and builds everything

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install dependencies with canvas build deps
FROM base AS deps
RUN apk add --no-cache \
    build-base \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    pixman-dev \
    python3

# Copy full workspace (needed for pnpm to create proper package-level node_modules)
COPY . .

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder

# Copy everything from deps stage (source + node_modules)
COPY --from=deps /app ./

# Clean stale TypeScript build info files (prevents module resolution issues)
RUN find . -name "*.tsbuildinfo" -delete

# Build using Turborepo (automatically handles dependency order)
# The "..." suffix means "build this package AND all its dependencies"
RUN pnpm exec turbo run build --filter=@patina/designer-portal...

# Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/designer-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/designer-portal/.next/static ./apps/designer-portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/designer-portal/public ./apps/designer-portal/public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/designer-portal/server.js"]
