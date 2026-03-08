#!/bin/bash

# Setup development environment

set -e

echo "🚀 Setting up Aesthete Engine development environment"
echo "===================================================="

# Check Python version
python_version=$(python3 --version | awk '{print $2}')
echo "Python version: $python_version"

if [[ ! $python_version =~ ^3\.(11|12) ]]; then
    echo "❌ Python 3.11+ required"
    exit 1
fi

# Create virtual environment
echo ""
echo "📦 Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo ""
echo "📥 Installing dependencies..."
pip install -r requirements-dev.txt

# Copy environment file
if [ ! -f ".env" ]; then
    echo ""
    echo "📄 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration"
fi

# Start Docker services
echo ""
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis mlflow

# Wait for services
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run database migrations
echo ""
echo "🗄️  Running database migrations..."
# alembic upgrade head  # Uncomment when migrations are set up

echo ""
echo "✅ Development environment ready!"
echo ""
echo "Next steps:"
echo "  1. Update .env with your configuration"
echo "  2. Run: uvicorn app.main:app --reload"
echo "  3. Visit: http://localhost:8000/docs"
