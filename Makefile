.PHONY: up down logs health test build preflight-local preflight-staging preflight-production

up:
	./scripts/compose.sh local up -d --build

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

preflight-local:
	./scripts/check-config.sh local

preflight-staging:
	./scripts/check-config.sh staging

preflight-production:
	./scripts/check-config.sh production
