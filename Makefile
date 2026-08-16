.PHONY: help install dev test lint format clean build seed migrate

help:  ## Show this help
	@grep -E '^\S+:' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*##"} { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' | sort

install:  ## Install dependencies
	pip install -r requirements.txt
	pip install -r requirements-dev.txt

dev:  ## Run in development mode (hot reload)
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:  ## Run tests
	pytest tests/ -v

test-cov:  ## Run tests with coverage
	pytest tests/ --cov=app --cov-report=term-missing

lint:  ## Run linters
	ruff check app/ tests/
	mypy app/ --ignore-missing-imports

format:  ## Format code
	ruff format app/ tests/

migrate:  ## Generate a new migration
	alembic revision --autogenerate -m "$(message)"

migrate-up:  ## Apply migrations
	alembic upgrade head

migrate-down:  ## Rollback last migration
	alembic downgrade -1

seed:  ## Seed the database with initial data
	python -m app.seed

build:  ## Build Docker image
	docker build -t phikila/backend .

clean:  ## Remove caches and temp files
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -name "*.pyc" -delete
	rm -rf .pytest_cache .mypy_cache .ruff_cache
