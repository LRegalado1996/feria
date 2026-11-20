# FER-046 Read a page's head in e2e tests without CSS selectors

- **Milestone:** M0 Foundation
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-043

## Goal

E2E specs follow `docs/agents/testing.md` § E2E tests, "Never raw CSS selectors", also for what a page puts in its `<head>`. Today the head is read with raw selectors, because a `<meta>`, `<link>` or JSON-LD `<script>` has no role, label or text and Next's metadata API gives it no `data-testid`: `meta[name="robots"]` and `meta[name="description"]`, `link[rel="canonical"]`, `link[rel="alternate"][hreflang=…]` and `script[type="application/ld+json"]`, in `design-system.e2e.ts`, `store/article.e2e.ts`, `store/store.e2e.ts` (on qa since FER-024), `not-found.e2e.ts` and `store/catalog-pages.e2e.ts` (FER-043). CodeRabbit flagged the last two on PR #56.

## Scope

- One helper in `src/e2e/` that reads the head through DOM APIs (`document.getElementsByName`, `document.head`'s links and scripts), polled the way a locator is, by meaning: the description, the robots directive, the canonical address, the alternate address of a language, the JSON-LD blocks.
- Every spec above reads the head through it, with the same exact assertions.
- `docs/agents/testing.md` § E2E tests and `src/e2e/AGENTS.md` name the helper as the way to read the head.

## Acceptance criteria

- `grep -rn "locator('meta\|locator('link\|locator('script" src/e2e` finds nothing.
- Every assertion keeps its exact value; `pnpm e2e:ci` passes.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
