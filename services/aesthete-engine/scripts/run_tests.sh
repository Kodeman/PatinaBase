#!/bin/bash

# Run test suite for Aesthete Engine

set -e

echo "🧪 Running Aesthete Engine Tests"
echo "================================"

# Activate virtual environment if exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run linting
echo ""
echo "📝 Running linters..."
black --check app tests
ruff check app tests
mypy app

# Run tests with coverage
echo ""
echo "🔬 Running tests..."
pytest -v \
    --cov=app \
    --cov-report=term-missing \
    --cov-report=html \
    --cov-report=xml \
    --tb=short

# Check coverage threshold
echo ""
echo "📊 Checking coverage threshold..."
coverage report --fail-under=80

echo ""
echo "✅ All tests passed!"
