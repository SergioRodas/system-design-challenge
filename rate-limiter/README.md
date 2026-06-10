# Rate Limiter

A distributed API rate limiter in TypeScript, built for the IOL technical challenge and based on
Chapter 4 of *System Design Interview* by Alex Xu.

It ships two algorithms — **Token Bucket** (default) and **Sliding Window Log** — behind a single
`RateLimiter` interface, backed by **Redis** for shared state across instances (with an in-memory
store used for tests and local single-instance runs). Limits are enforced by Express middleware that
sets standard `X-RateLimit-*` headers and returns `429 Too Many Requests` when a client is over the
limit.

> Design rationale, algorithm trade-offs, and notes on how AI was used live in [DESIGN.md](DESIGN.md).

## Features

- **Token Bucket** rate limiting with an atomic Redis Lua script (safe under concurrency).
- **Sliding Window Log** as a selectable alternative algorithm.
- **Pluggable storage** behind a `Store` interface — Redis for production, in-memory for tests.
- Standard rate-limit response headers (`X-RateLimit-Limit`, `-Remaining`, `-Reset`, `Retry-After`).
- Configurable entirely through environment variables.
- 22 tests (unit + integration); Redis integration tests skip automatically when Redis is absent.

## Tech stack

Node.js · TypeScript (strict) · Express · ioredis · Jest + supertest · Docker Compose (Redis).

## Prerequisites

- **Node.js 18+** and npm
- **Docker** (for Redis via Docker Compose) — only needed to run the server or the Redis integration
  tests. Unit tests need neither Docker nor a network.

## Setup

```bash
npm install
cp .env.example .env      # adjust values if needed (Windows: copy .env.example .env)
```

## Configuration

All configuration is via environment variables (loaded from `.env` by `dotenv`):

| Variable                  | Default                  | Description                                      |
| ------------------------- | ------------------------ | ------------------------------------------------ |
| `PORT`                    | `3000`                   | HTTP port the server listens on                  |
| `REDIS_URL`               | `redis://localhost:6379` | Redis connection string                          |
| `RATE_LIMIT_ALGORITHM`    | `token-bucket`           | `token-bucket` or `sliding-window`               |
| `RATE_LIMIT_MAX_REQUESTS` | `10`                     | Max requests allowed per window                  |
| `RATE_LIMIT_WINDOW_MS`    | `60000`                  | Window size in milliseconds (60s)                |

Requests are rate-limited **per client IP** by default.

## Running the project

Start Redis first (the server connects to it on boot):

```bash
docker-compose up -d        # start Redis in the background
```

Then run the server in one of two modes:

```bash
# Development — hot reload via ts-node-dev
npm run dev

# Production — compile to dist/ and run the compiled output
npm run build
npm start
```

The server logs `rate-limiter listening on port 3000 (algorithm: token-bucket)` once it's up.

When you're done:

```bash
docker-compose down         # stop Redis
```

## API

| Method | Endpoint    | Rate limited? | Description                          |
| ------ | ----------- | ------------- | ----------------------------------- |
| `GET`  | `/ping`     | No            | Liveness check — always `200`       |
| `GET`  | `/api/data` | Yes           | Returns data; consumes one token    |

### Example: a request under the limit

```bash
curl -i http://localhost:3000/api/data
```

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1717200000
Content-Type: application/json

{"data":"here is your data"}
```

### Example: once the limit is exceeded

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1717200000
Retry-After: 42

{"error":"Too Many Requests"}
```

`Retry-After` (seconds until a token is available) is only sent on `429` responses.

## Testing

```bash
npm test            # all tests (unit + integration)
npm run test:unit   # unit tests only — no Docker, no network
```

- **Unit tests** (`tests/unit/`) cover the Token Bucket and Sliding Window algorithms against the
  in-memory store, using an injected clock so timing is deterministic.
- **Integration tests** (`tests/integration/`) exercise the full Express stack. `api.test.ts` runs
  on the in-memory store (no Redis required); `redis.test.ts` drives the real Redis Lua path and is
  **skipped automatically** when Redis is unreachable, so the full suite stays green in CI without
  Docker. To run the Redis tests, start Redis first with `docker-compose up -d`.

## Project structure

```
src/
  algorithms/        # Pure rate-limiting logic — no framework, no I/O
    token-bucket.ts          # In-memory / Store-backed token bucket
    redis-token-bucket.ts    # Redis token bucket (atomic Lua consume)
    sliding-window.ts        # Sliding window log
    rate-limiter.interface.ts
  storage/           # Storage adapters behind a single Store interface
    memory.store.ts
    redis.store.ts
    store.interface.ts
  middleware/        # Express glue — sets headers, returns 429
    rate-limit.middleware.ts
  routes/            # Route definitions
  app.ts             # Express app assembly (no listen)
  server.ts          # Entry point — wires config + Redis, then listens
  logger.ts          # Minimal logger wrapper
tests/
  unit/              # Algorithm tests (no Redis/network)
  integration/       # HTTP + Redis tests
```

## License

MIT
