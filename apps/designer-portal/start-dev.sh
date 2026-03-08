#!/bin/bash

# Designer Portal Development Server Startup Script
# This script ensures all dependencies are built and starts the dev server

set -e  # Exit on error

echo "🎨 Starting Patina Designer Portal..."
echo ""

# Navigate to the designer portal directory
cd "$(dirname "$0")"

# Step 1: Check if shared packages are built
echo "📦 Checking shared packages..."

if [ ! -f "../../packages/design-system/dist/index.js" ]; then
    echo "⚠️  Design system not built. Building now..."
    cd ../../packages/patina-design-system
    pnpm build
    cd ../../apps/designer-portal
fi

if [ ! -d "../../packages/types/dist" ]; then
    echo "⚠️  Types package not built. Building now..."
    cd ../../packages/types
    pnpm build
    cd ../../apps/designer-portal
fi

if [ ! -d "../../packages/utils/dist" ]; then
    echo "⚠️  Utils package not built. Building now..."
    cd ../../packages/utils
    pnpm build
    cd ../../apps/designer-portal
fi

if [ ! -d "../../packages/api-client/dist" ]; then
    echo "⚠️  API client not built. Building now..."
    cd ../../packages/api-client
    pnpm build
    cd ../../apps/designer-portal
fi

echo "✅ All shared packages are ready"
echo ""

# Step 2: Clear Next.js cache if requested
if [ "$1" = "--clean" ]; then
    echo "🧹 Cleaning Next.js cache..."
    rm -rf .next
    echo "✅ Cache cleared"
    echo ""
fi

# Step 3: Check environment files
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found!"
    echo "Please create .env.local with your local configuration"
    echo "See .env.example for reference"
    exit 1
fi

echo "🌍 Environment: $(grep NEXT_PUBLIC_ENV .env.local | cut -d '=' -f2)"
echo "🔐 Auth URL: $(grep NEXTAUTH_URL .env.local | cut -d '=' -f2)"
echo ""

# Step 4: Determine port
PORT=${2:-3003}
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port $PORT is already in use!"
    echo "Please stop the process using this port or use a different port:"
    echo "  ./start-dev.sh --clean 3004"
    exit 1
fi

echo "🚀 Starting development server on port $PORT..."
echo "📍 URL: http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 5: Start the dev server
pnpm dev -p $PORT
