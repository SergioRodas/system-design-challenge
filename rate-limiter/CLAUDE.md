# Rate Limiter — Project Context for Claude Code

## Project summary
TypeScript implementation of a Rate Limiter (Chapter 4, System Design Interview by Alex Xu).
Built for the IOL technical challenge. Stack: Node.js, Express, TypeScript, Jest, Redis (via ioredis), Docker Compose.

## Goal
Deliver a working, tested, well-designed prototype. Correctness and test coverage are mandatory.
Elegant design and avoiding overengineering are explicitly valued by the reviewers.

## Folder structure
```
/rate-limiter
  /src
    /algorithms       # Core rate limiting logic (no framework dependencies)
      token-bucket.ts
      sliding-window.ts
      rate-limiter.interface.ts
    /middleware       # Express middleware that uses the algorithms
      rate-limit.middleware.ts
    /storage          # Storage adapters (in-memory and Redis)
      memory.store.ts
      redis.store.ts
      store.interface.ts
    /routes           # Express route definitions
      index.ts
    app.ts            # Express app setup (no listen here)
    server.ts         # Entry point — calls app.listen
  /tests
    /unit             # Tests for algorithms and storage — no HTTP, no Redis
    /integration      # Tests that spin up the Express app and/or Redis
  DESIGN.md
  docker-compose.yml
  tsconfig.json
  jest.config.ts
  package.json
```

## Conventions
- Language: TypeScript strict mode (`"strict": true` in tsconfig)
- No `any` types — use proper interfaces or `unknown`
- Interfaces go in `.interface.ts` files inside their domain folder
- Pure functions preferred in `/algorithms` — no side effects, no I/O
- Error handling: use typed errors, never swallow exceptions silently
- Comments: write your own for non-obvious logic; do not auto-generate JSDoc on every function
- Naming: camelCase for variables/functions, PascalCase for classes/interfaces/types

## Testing rules
- Unit tests live in `/tests/unit` and must run without Redis or any network
- Integration tests live in `/tests/integration` and use a real Redis (via docker-compose)
- Test file naming: `<module>.test.ts`
- Coverage target: core algorithms must have 100% branch coverage
- Use `jest --testPathPattern=unit` to run only unit tests (fast, no Docker needed)

## What NOT to do
- Do not add NestJS, decorators, or any heavy framework — Express only
- Do not over-abstract — if something is used in one place, don't extract it to a utility
- Do not generate comments on every function — only where the logic is genuinely non-obvious
- Do not use `console.log` for logging in production code — use a simple logger wrapper
- Do not add dependencies without checking if the standard library already covers it

## Key dependencies (use these, don't add alternatives)
- `express` + `@types/express`
- `ioredis` — Redis client (preferred over `redis` npm package for TypeScript support)
- `jest` + `ts-jest` — testing
- `supertest` — HTTP integration testing
- `dotenv` — environment config

## Environment variables
```
PORT=3000
REDIS_URL=redis://localhost:6379
RATE_LIMIT_ALGORITHM=token-bucket   # or sliding-window
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

## How to run (expected commands)
```bash
npm install
docker-compose up -d        # starts Redis
npm run build               # tsc compile
npm test                    # all tests
npm run test:unit           # unit only (no Docker needed)
npm start                   # runs compiled server
npm run dev                 # ts-node-dev for development
```

## DESIGN.md reminders (fill this as you build)
Document in DESIGN.md:
- Why Token Bucket was chosen as the primary algorithm
- Trade-offs vs Sliding Window Log and Fixed Window Counter
- Why Redis for distributed storage (vs in-memory only)
- How AI (Claude Code) was used in this project
- Any piece of AI-generated code you didn't fully understand — explain it there
