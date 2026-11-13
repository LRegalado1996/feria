# Skew Protection

A tab keeps running the JavaScript of the deployment that served it. Without a pin, its oRPC calls reach whichever deployment serves the domain now, so after a release an old bundle can send a request the new server refuses (a field it now requires), identically on every retry, and nothing reloads the tab.

## How the app pins

- Next adds `x-deployment-id` to its own navigations, prefetches and Server Actions, never to a hand-rolled `fetch`, and every oRPC call is one. The link in `src/lib/orpc/client.tsx` adds it itself (`withDeploymentPin`), from the build's `process.env.NEXT_DEPLOYMENT_ID`. Keep that a literal member access: the bundler replaces exactly that expression. Builds without an id (`next dev`, standalone, CI e2e) send no header.
- When Vercel will not route a pin (a 404 carrying its own `x-vercel-error` header), the link drops the pin for the rest of the tab and re-sends the call once, unpinned. That is safe for a mutation: nothing ran. Any other status keeps the pin; the oRPC handler never sets `x-vercel-error`, so a business `NOT_FOUND` is not a refusal.

## Operating it

- **Turn it on** in the Vercel project (Settings → Advanced → Skew Protection) and set **Maximum Age** to at least the usual gap between releases. The age counts from the deployment's creation, not from when it stopped serving production; a window shorter than the gap protects nothing.
- **The previous build keeps serving pinned tabs**, writes included, until its window closes. Keep migrations backward compatible for that window (expand, then contract: `docs/agents/database.md`).
- **Before a repair that must run after cutover**, or as soon as a migration the previous build cannot run against is live, open the new deployment in Vercel and set its **Skew Protection Threshold**: older deployments stop answering pinned calls, which the link then re-sends to the new build.
- **A rollback** leaves tabs pinned to the deployment rolled back from; a threshold does not reach it. Deleting that deployment releases them.
- **Verify with traffic**, not a made-up id (Vercel serves an unknown id from the current deployment): after a release, the previous deployment's runtime logs should keep showing `/api/orpc` requests from tabs opened before it.
