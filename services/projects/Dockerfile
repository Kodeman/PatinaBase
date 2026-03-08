# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for native modules (canvas, etc.)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all package.json files to preserve workspace structure
COPY packages/*/package.json packages/
COPY services/*/package.json services/
COPY apps/*/package.json apps/

# Copy all source code first (needed for workspace dependencies)
COPY . .

# Ensure devDependencies are installed during build (override any NODE_ENV=production)
ENV NODE_ENV=development

# Install all dependencies with proper workspace resolution
# Using --no-frozen-lockfile temporarily due to new services not in lockfile
RUN pnpm install --no-frozen-lockfile

# Generate Prisma client for projects service (required before build)
RUN cd services/projects && pnpm exec prisma generate

# CRITICAL FIX: Clean any stale .tsbuildinfo files before build
# This prevents TypeScript from thinking builds are up-to-date when they're not
RUN find . -name "*.tsbuildinfo" -delete

# Build all packages the projects service depends on, using Turborepo for dependency resolution
# Turborepo automatically handles build order via "dependsOn": ["^build"] in turbo.json
# The "..." suffix means "build this package and all its dependencies"
RUN pnpm turbo build --filter=@patina/projects...

# Production stage
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all package.json files
COPY packages/*/package.json packages/
COPY services/*/package.json services/
COPY apps/*/package.json apps/

# Install production dependencies only (skip lifecycle scripts to avoid husky)
# Using --no-frozen-lockfile temporarily due to new services not in lockfile
RUN pnpm install --no-frozen-lockfile --prod --ignore-scripts

# Copy built outputs from builder stage
COPY --from=builder /workspace/packages/*/dist packages/
COPY --from=builder /workspace/services/projects/dist services/projects/dist
COPY --from=builder /workspace/services/projects/prisma services/projects/prisma

# Copy Prisma client from builder - it was generated in the builder stage
# The client is in the node_modules of the service after generation
COPY --from=builder /workspace/node_modules/.pnpm node_modules/.pnpm

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

WORKDIR /workspace/services/projects

EXPOSE 3016

CMD ["node", "dist/main"]
