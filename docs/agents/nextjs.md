# Next.js 16

The rules this app's Next configuration imposes. The API reference is `node_modules/next/dist/docs/`; read it before using an API you have not used here.

## Configuration (`next.config.js`)

- `cacheComponents` and `partialPrefetching` are on: every route renders dynamically unless cached, Next prerenders the static part into a shell, and a `<Link>` prefetches that shell ahead of the click.
- `reactCompiler` is on, through Turbopack's native compiler (`experimental.turbopackRustReactCompiler`), so no Babel plugin is installed.
- `output: "standalone"` only off Vercel (`VERCEL !== "1"`): Vercel packages the app itself; standalone is for Docker and CI's e2e runtime.
- Response headers that every deployment target must send (security headers) live in `headers()` here, never in `vercel.json`.

## Layouts and pages

- **Never `await` the session, `headers()` or `cookies()` at the top of a layout or page.** A top-level request read holds the whole segment, `{children}` included, behind the request. Put the decision in an async resolver inside `<Suspense>`, with a static fallback above it (`src/app/[locale]/page.tsx`: `Home` → `HomeResolver`).
- A fallback mirrors what it stands for, or stays an empty `aria-busy` canvas when the outcomes differ (signed out vs signed in): a skeleton for the wrong screen is a lie and a layout shift.
- **Layouts are UI chrome.** Auth is decided per page, inside its boundary.
- **The root layout is `src/app/[locale]/layout.tsx`.** `locale` is the one param known at build time (`generateStaticParams` lists both languages), so awaiting it at the top of a layout or page holds nothing behind a request; every other param follows the rule below. Types for `params` are written by hand (`Promise<{ locale: string }>`): nothing here runs `next typegen`, so `PageProps`, `LayoutProps` and `next/root-params` are not available to `pnpm typecheck`.
- **No `export const dynamic`, `revalidate` or `fetchCache`.** Cache with `"use cache"` and an explicit `cacheLife`. `force-static` is inert on a GET route handler under Cache Components: wrap its work in `"use cache"` and check the build's route table (`○`/`◐`/`ƒ`) after the change.
- **`params` and `searchParams` are promises.** Pass the promise into the boundary and await it there. `useParams()`/`useSearchParams()` in a client component need a `<Suspense>` above them.
- **Request-time values:** `Date.now()`, `new Date()`, `Math.random()` and `crypto.randomUUID()` in a server component run after `await connection()` (or another request read) inside a boundary, or move to a client component's effect.
- **Environment gates:** a value fixed per deployment (`VERCEL_ENV`, the branch) can be read at build time. A gate on a value that differs between build and runtime calls `await connection()` first. `export const instant = false` lets a route block on the server but does not stop prerendering.
- **Redirects inside a boundary** arrive after the shell has streamed. An e2e test waits for the destination's content, never for the URL alone.

## Store pages and cached reads

- **A store's public pages live under `src/app/[locale]/[store]/`.** Its layout looks the store up by the URL's first segment, answers 404 when no active store has it, and writes the store's colors (`design.md` § Storefront). `/admin`, `/api`, `/design`, `/en`, `/es` and `/monitoring` can never be a store: the slug schema and a database check refuse them (`RESERVED_STORE_SLUGS` in `src/lib/schemas/store`). A new top-level route is added to that list in the change that creates it, with a migration for the check.
- **A cached read lives in `src/server/cache/`**, next to the function that invalidates it. `getStoreForPath()` is `"use cache"` with a `cacheLife` and two tags, the store's id and the address asked for (a "no such store" answer has no id). It calls the service with the app's own `db`, not the oRPC `caller`: that one builds its context from `headers()`, which a cached function may not read.
- **A procedure that writes what a cached read returns invalidates it after the write** (`invalidateStoreCache()` in the `store` router): `revalidateTag(tag, { expire: 0 })`, so the next visit reads the database. `updateTag` only works in a Server Action, and the `"max"` profile would keep serving the old colors until someone visits twice.
- **A real 404 needs the lookup to finish before the response starts.** A page whose lookup sits behind `<Suspense>`, or whose route is a shell that streams, is committed to a 200 and shows the not-found page under it. The store home is `ensureStatic = "navigation"` with one sample `generateStaticParams`: each address is rendered in full on its first visit and kept, so an unknown address answers 404, and the page may read nothing request-time (`cookies()`, `headers()`, server `searchParams`, uncached data). A store page that needs those reads them in a client component or gives up the static requirement and, with it, the status code. `src/e2e/tests/store/store.e2e.ts` holds both.

## Navigation

- **After signing in, signing up or signing out, navigate with a full page load** (`window.location.assign(target)`), never `router.refresh()`/`router.push()`. A soft navigation can keep a shell rendered for the old session, or settle on the URL of a server-redirect chain without its content.
- **Changing language is a soft navigation** (`molecules/locale-toggle` is a `<Link>`): the `[locale]` layout re-renders under the new param, `<html lang>` updates and the theme class stays.
- **Routes stay mounted.** Cache Components keeps a route you navigate away from inside React's `<Activity mode="hidden">`: its state survives, its effects are cleaned up and re-run on return, and its DOM stays in the document, so a global `:has()` selector or a `document.querySelector` can match a hidden tree.

## React Compiler

- Components are memoized automatically; don't add `useMemo`/`useCallback` for render cost.
- A component that reads a library's mutable instance during render (TanStack Table's `getRowModel()`, `getHeaderGroups()`) starts with `"use no memo"`: the compiler cannot see the mutation and skips the re-render.
- react-hook-form: bind fields through `<FormField>` (a `Controller`, re-registered by its own hook), never a `{...register("field")}` spread: `reset()` forgets every registered field, a memoized spread never registers it again, and what the user types next is lost on submit. Read form state with `useFormState`/`useWatch`, never `form.formState`/`form.watch()`: a read off the stable `form` object is memoized and goes stale. A form whose schema changes (sign-in vs sign-up) is keyed and remounted, not reset (`organisms/auth-form`). The escape hatch for a library the compiler cannot follow is `"use no memo"` as the component's first statement.
- An impure call in render (`Date.now()`, `Math.random()`) is memoized as if it were pure. Pass time in as a prop or state (`useNow`).
- Compiler regressions do not show in unit tests (Vitest does not run the compiler). Only e2e against a production build (`pnpm e2e:ci`) catches them.

## Hydration

The server renders at one instant and the browser hydrates later; React throws away the server HTML for any subtree whose first client render differs.

- A client component's first render reads nothing the server could not: no `Date.now()`, `Math.random()`, `window`, `localStorage` or time-zone-dependent formatting. Seed a clock from the server's instant and switch after mount: `useNow(renderedAt)` (`src/lib/hooks/ui/use-now.ts`), as the feed's relative times do.
- A remembered client preference (`localStorage`) never changes the first client render: read it with `useSyncExternalStore` and a `null` server snapshot, and keep the region's skeleton until it resolves.
- A value several client components read from the query cache is seeded at a shared ancestor above all of them: React hydrates whichever boundary the user touches first.
- A Suspense fallback or `loading.tsx` declares the same structure as the page it stands for.
- Tests: a component whose output depends on the clock gets a unit test with `collectHydrationErrors` (`src/test/hydration.ts`), which server-renders at one instant and hydrates at a later one; `renderHook` and `render` never hydrate. `src/e2e/tests/hydration.e2e.ts` fails on any hydration error in the browser console.

## Proxy

`src/proxy.ts` (formerly `middleware.ts`) does two things and decides no access: it stamps `/api` requests with a request id for logging, and it routes page requests by language (`docs/agents/i18n.md`): unprefixed paths are rewritten to `/es/...`, `/es/...` redirects to the unprefixed URL, `/en/...` passes through. Its `matcher` is one constant pattern that leaves out Next's assets, Vercel's endpoints, the Sentry tunnel and the files in `public/`, each by name; a new top-level path that must not get a language is added there. If it ever redirects on a session cookie, that is optimistic only: pages and procedures still check the session themselves.

`usePathname()` can return the rewritten path (`/es/...`) on the server and the browser's on the client. Render only what does not depend on that prefix: the result of `localizePath()`, or the `pathname` `splitLocale()` returns. Never the `locale` it returns (`"es"` for the rewritten path, `null` for the browser's): the page's language comes from `useLocale()`.
