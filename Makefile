# Makefile — Common development commands for P2P Share (AirPass)

.PHONY: dev dev-docker test test-backend test-frontend certs help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start backend + frontend dev servers (no Docker)
	@trap 'kill 0' EXIT; \
	echo "Starting backend on :8000 and frontend on :3000..."; \
	(cd backend && uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload) & \
	(cd frontend && python3 -m http.server 3000) & \
	echo "Backend: http://localhost:8000"; \
	echo "Frontend: http://localhost:3000"; \
	wait

dev-docker: ## Start development Docker Compose stack
	docker compose -f docker/develop/docker-compose.yml up --build

dev-docker-down: ## Stop development Docker Compose stack
	docker compose -f docker/develop/docker-compose.yml down

prod-docker: ## Start production Docker Compose stack
	docker compose -f docker/production/docker-compose.yml up --build -d

prod-docker-down: ## Stop production Docker Compose stack
	docker compose -f docker/production/docker-compose.yml down

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend pytest suite
	cd backend && uv run pytest tests/ -v

test-frontend: ## Run frontend vitest suite
	cd frontend && npx vitest run

certs: ## Generate self-signed SSL certificates for local dev
	bash scripts/generate-dev-certs.sh

clean: ## Remove generated files and caches
	rm -rf backend/.pytest_cache backend/__pycache__ backend/tests/__pycache__
	rm -rf frontend/node_modules/.cache
