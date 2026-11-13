---
name: orpc
description: >-
  oRPC framework patterns, best practices, and API reference. Use when writing,
  reviewing, or refactoring oRPC code involving: (1) procedures, routers, or
  middleware with @orpc/server, (2) RPCHandler or OpenAPIHandler setup,
  (3) client-side or server-side clients with @orpc/client, (4) TanStack Query
  integration with @orpc/tanstack-query, (5) error handling with ORPCError,
  (6) testing procedures with call() or mock contexts, (7) Event Iterators,
  file uploads, server actions, or contract-first development.
---

# Documentation

Fetch latest docs with WebFetch before oRPC tasks. Check installed version in `package.json` under `@orpc/server`.

- **Summary:** `https://orpc.dev/llms.txt`
- **Full docs:** `https://orpc.dev/llms-full.txt`

# Project Architecture

| Concern | File |
|---------|------|
| Context, procedures (`publicProcedure`, `protectedProcedure`) | `src/server/api/orpc/index.ts` |
| Router definitions | `src/server/api/routers/*.ts` |
| Root router (`appRouter`) | `src/server/api/root.ts` |
| Next.js API route (`RPCHandler`) | `src/app/api/orpc/[[...rest]]/route.ts` |
| Server-side client (RSC, `createRouterClient`) | `src/lib/orpc/server.ts` |
| Client-side client (browser, `RPCLink`) | `src/lib/orpc/client.tsx` |
| TanStack Query client factory | `src/lib/orpc/query-client.ts` |
| Base URL resolution (Vercel-aware) | `src/lib/orpc/get-base-url.ts` |
| Input schemas (Zod) | `src/lib/schemas/*/index.ts` |
| Test helpers (mock context) | `src/server/test/context.ts` |

# Conventions

- Better Auth sessions via `createORPCContext`. Protected routes use `protectedProcedure`.
- Routers are plain objects of procedures, aggregated in `root.ts`.
- RSC uses `createRouterClient` (direct, no HTTP). Browser uses `RPCLink` with `credentials: "include"`.
- Both server/client use `createTanstackQueryUtils` for TanStack Query.
- Test with `call()` from `@orpc/server` with mock context, or extract handler logic.
