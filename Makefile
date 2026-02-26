.PHONY: up down logs health test build

up:
	docker compose up -d --build

down:
	docker compose down -v

logs:
	docker compose logs -f --tail=100

health:
	./scripts/healthcheck.sh

build:
	npm ci
	npm run build

test:
	npm ci
	npm run test
