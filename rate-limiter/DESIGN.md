# Rate Limiter — Design Document

## Problem
Implement a rate limiter that controls how many requests a client can make to an API within a time window.
Based on Chapter 4 of "System Design Interview" by Alex Xu.

## Algorithm choice: Token Bucket (primary)

### How it works
Each client has a "bucket" that holds up to N tokens. Tokens are added at a fixed rate (refill rate).
Each request consumes one token. If the bucket is empty, the request is rejected (HTTP 429).

### Why Token Bucket over alternatives

| Algorithm | Pros | Cons | Decision |
|---|---|---|---|
| Token Bucket | Allows short bursts, memory-efficient, simple | Harder to reason about exact rates at edges | ✅ Primary |
| Sliding Window Log | Most accurate, no boundary spikes | High memory usage (stores every timestamp) | Implemented as secondary option |
| Fixed Window Counter | Simplest to implement | "Double traffic" bug at window boundaries | Rejected |
| Sliding Window Counter | Good accuracy, low memory | Approximation, more complex | Skipped to avoid overengineering |

Token Bucket is the right default for an API rate limiter because real traffic comes in bursts,
and penalizing a user who makes 10 requests in 2 seconds (but stays under the per-minute limit)
would be a bad user experience.

## Storage: Redis (distributed) + In-memory (local/testing)

### Why Redis
- Shared state across multiple server instances (horizontal scaling)
- Native TTL support — keys expire automatically, no cleanup needed
- Atomic operations via Lua scripts — prevents race conditions under concurrency
- Matches IOL's existing stack (Redis is listed in the job requirements)

### In-memory store
Used for unit tests and single-instance local development. Same interface as the Redis store,
so the algorithm layer never knows which storage is being used.

## Architecture decisions

### Separation of concerns
- `/algorithms`: pure logic, no I/O, no framework — testable without any infrastructure
- `/storage`: adapters behind an interface — swappable without touching business logic
- `/middleware`: glues Express to the rate limiter — thin layer, delegates to algorithms

### Why Express and not NestJS
The challenge scope doesn't justify NestJS's overhead. Express with TypeScript and a clear folder
structure is sufficient, readable, and easier to reason about during a code review.

### Concurrency
Redis operations use atomic Lua scripts for the token refill + consume step.
This prevents the race condition where two concurrent requests both read "1 token left",
both think they can proceed, and both consume it — effectively allowing 2 requests instead of 1.

## Standard response headers
Following RFC 6585 and common API conventions:
```
X-RateLimit-Limit: 10          # max requests allowed
X-RateLimit-Remaining: 7       # tokens left in current window
X-RateLimit-Reset: 1717200000  # Unix timestamp when the bucket resets
Retry-After: 30                # seconds to wait (only on 429 responses)
```

## How AI (Claude Code) was used
- Generated the initial folder structure and tsconfig based on the CLAUDE.md specification
- Implemented the Redis Lua script for atomic token operations (see note below)
- Generated Jest configuration and test boilerplate

### Code I reviewed carefully before accepting
**Redis Lua script** (`src/storage/redis.store.ts`): The atomic script that checks and updates
the token count. I verified it handles the TTL reset correctly and doesn't have an off-by-one
error on the token count. The logic is: if key doesn't exist, initialize with (max - 1) tokens
and set TTL. If key exists, decrement only if count > 0.

## Trade-offs and known limitations
- In-memory store is not suitable for production (state lost on restart, not shared across instances)
- Token bucket doesn't guarantee a perfectly smooth request rate — bursts are allowed by design
- No persistent storage for audit logs (out of scope for this prototype)
- Rate limiting is per IP by default — a real system would rate limit by API key or user ID

## Running the project
```bash
docker-compose up -d   # start Redis
npm run dev            # development server with hot reload
npm test               # all tests (requires Redis)
npm run test:unit      # unit tests only (no Redis needed)
```
