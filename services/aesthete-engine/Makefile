.PHONY: help install test lint format run docker-build docker-up docker-down clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	pip install -r requirements-dev.txt

test: ## Run tests with coverage
	pytest -v --cov=app --cov-report=term-missing --cov-report=html

test-fast: ## Run tests without coverage
	pytest -v

lint: ## Run linters
	black --check app tests
	ruff check app tests
	mypy app

format: ## Format code
	black app tests
	isort app tests

run: ## Run development server
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

docker-build: ## Build Docker image
	docker build -t aesthete-engine:latest --target production .

docker-build-dev: ## Build development Docker image
	docker build -t aesthete-engine:dev --target development .

docker-up: ## Start Docker services
	docker-compose up -d

docker-down: ## Stop Docker services
	docker-compose down

docker-logs: ## View Docker logs
	docker-compose logs -f aesthete-engine

clean: ## Clean up generated files
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -rf dist
	rm -rf build
	rm -rf *.egg-info

setup-dev: ## Setup development environment
	./scripts/setup_dev.sh

k8s-deploy: ## Deploy to Kubernetes
	kubectl apply -f k8s/configmap.yaml
	kubectl apply -f k8s/deployment.yaml

k8s-status: ## Check Kubernetes deployment status
	kubectl get pods -n patina -l app=aesthete-engine

k8s-logs: ## View Kubernetes logs
	kubectl logs -n patina -l app=aesthete-engine --tail=100 -f
