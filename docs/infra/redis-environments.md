# Redis topology and environment strategy

## Queue naming and versioning
- Queue names are versioned in code: `lec.v1.ingestion`, `lec.v1.transcription`, `lec.v1.flashcard`.
- Environment separation is enforced with Redis key prefix:
  - local: `lec.local`
  - staging: `lec.staging`
  - production: `lec.prod`

## Redis topology by environment
- local: DB `0`, URL `redis://localhost:16379/0`
- staging: DB `1`, URL `redis://localhost:16379/1`
- production: DB `2`, URL `redis://localhost:16379/2`

For real staging/prod, replace URLs with managed Redis endpoints and enable TLS.

## Retention and cleanup policy
- `ingestion` queue:
  - attempts: 5
  - completed retention: 24h or 2000 jobs
  - failed retention: 7d or 5000 jobs
- `transcription` queue:
  - attempts: 4
  - completed retention: 24h or 2000 jobs
  - failed retention: 7d or 5000 jobs
- `flashcard` queue:
  - attempts: 3
  - completed retention: 24h or 2000 jobs
  - failed retention: 7d or 5000 jobs

## Secret handling strategy
- Store secrets in environment variables only.
- `env/.env.*` files are templates for local development and should not contain production secrets.
- CI/CD injects real secrets through GitHub Actions encrypted secrets.
- Deployment platforms should provide runtime secret managers.

## Deployment configuration checks
Run before each deploy:
1. `./scripts/check-config.sh <profile> --skip-redis`
2. `./scripts/check-config.sh <profile>`
3. `docker compose config` (for local compose-based rollout)
