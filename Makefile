.PHONY: up down logs health test build lint test-unit test-integration test-e2e test-all preflight-up preflight-local preflight-staging preflight-production smoke-ingestion

up: preflight-up
	./scripts/compose.sh local up -d --build

preflight-up:
	./scripts/preflight-up.sh

down:
	./scripts/compose.sh local down -v

logs:
	./scripts/compose.sh local logs -f --tail=100

health:
	./scripts/healthcheck.sh

build:
	npm ci
	npm run build

test:
	npm ci
	npm run test

lint:
	npm ci
	npm run lint

test-unit:
	npm ci
	npm run test:unit

test-integration:
	npm ci
	npm run test:integration

test-e2e:
	npm ci
	npm run test:e2e

test-all:
	npm ci
	npm run test:all

preflight-local:
	./scripts/check-config.sh local

preflight-staging:
	./scripts/check-config.sh staging

preflight-production:
	./scripts/check-config.sh production

smoke-ingestion:
	./scripts/smoke-ingestion.sh
