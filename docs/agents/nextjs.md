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

- **A store's public pages live under `src/app/[locale]/[store]/`.** Its layout looks the store up by the URL's first segment, answers 404 when no active store has it, and wraps its pages in `organisms/store-theme`, which writes the store's colors (`design.md` § Storefront). `/admin`, `/api`, `/coming-soon`, `/design`, `/en`, `/es`, `/monitoring`, `/seed` (the sample photos), and `platform` and `sign-in` (the admin's own segments after `/admin/`) can never be a store: the slug schema and a database check refuse them (`RESERVED_STORE_SLUGS` in `src/lib/schemas/store`). A new top-level route is added to that list in the change that creates it, with a migration for the check; a unit test compares the list with the folders under `src/app/` and fails until it is.
- **The layout puts every store page between `organisms/store-header` and `organisms/store-footer`** (FER-021), both rendered by the server from the cached store. What depends on the visitor stays in the browser: the cart's count reads the browser's cart (`useCart`), the language link reads the query string, the phone menu opens; none of it makes the page per-request.
- **A cached read lives in `src/server/cache/`**, next to the function that invalidates it. `getStoreForPath()` is `"use cache"` with a `cacheLife` and two tags, the store's id and the address asked for (a "no such store" answer has no id). It calls the service with the app's own `db`, not the oRPC `caller`: that one builds its context from `headers()`, which a cached function may not read.
- **A procedure that writes what a cached read returns invalidates it after the write** (`invalidateStoreCache()` in the `store` router): `revalidateTag(tag, { expire: 0 })`, so the next visit reads the database. `updateTag` only works in a Server Action, and the `"max"` profile would keep serving the old colors until someone visits twice.
- **A real 404 needs the lookup to finish before the response starts.** A page whose lookup sits behind `<Suspense>`, or whose route is a shell that streams, is committed to a 200 and shows the not-found page under it. The store home is `ensureStatic = "navigation"` with one sample `generateStaticParams`: each address is rendered in full on its first visit and kept, so an unknown address answers 404, and the page may read nothing request-time (`cookies()`, `headers()`, server `searchParams`, uncached data). A store page that needs something per request keeps its server output static and loads that part in the browser: a client component that calls a procedure, which is where cookies and headers are read. The alternative is to give up the static requirement and, with it, the status code. `src/e2e/tests/store/store.e2e.ts` holds both.
- **An article page (`/{store}/products/{slug}`, FER-024) keeps the static rule** like the home: its reads are cached in `src/server/cache/catalog.ts` (`readPublishedArticle`, `readRelatedArticles`, tagged `catalog:<storeId>`), a draft or a deleted article is a real 404, an address no article can have (not a slug, or too long) is answered `null` before the cache so made-up addresses cost neither a query nor an entry, and every write a shopper would see drops the tag. The article's share card draws only a photo on this site (`ownUrl()`), since its renderer fetches it from the server. Article writes (update, publish, unpublish, availability, delete, photo order) and category renames and deletions go through `writeToCatalog()` (`src/server/api/utils/write-to-store.ts`), which invalidates after the access-checked write; a store edit invalidates it too (its currency shows on every price). A new write that changes what an article page shows uses `writeToCatalog`.
- **The catalog (`/{store}/products`, FER-023) is the one store page that gives it up**, because its first criterion is a server-rendered first page with its own title for every selection, and the selection is the query string. It reads `searchParams` inside `<Suspense>` (`instant = false`), so it renders per request: a known store's catalog answers 200 with that selection, and an address under a store that does not exist answers the not-found page with a 200 and `noindex` (measured on a production build; the layout's own 404 cannot change a status the stream already sent). Every other store page keeps the static rule. A link's selection is read with `readCatalogQuery()` (`src/lib/catalog/query.ts`), which drops anything malformed before it reaches the API.

## Search engines and AI assistants

- **Where each surface lives (FER-024):** `src/app/sitemap.ts` (`/sitemap.xml`: each active store's home, catalog and published articles, in Spanish and English with `hreflang` alternates), `src/app/robots.ts` (`/robots.txt`: everyone allowed, the AI crawlers named, `/admin`, `/api/` and `/coming-soon` disallowed in both languages, each root anchored with `$` so a store whose address only starts alike (`/apio`) stays crawlable and its query (`/admin?next=…`) disallowed by a `?` rule, the sitemap declared) and `src/app/[locale]/[store]/llms.txt/route.ts` (`/{store}/llms.txt` and `/en/{store}/llms.txt`, built by `src/lib/seo/llms.ts`, its text in `src/content/{es,en}/seo.ts`). Absolute URLs come from `siteOrigin()` / `absoluteUrl()` (`src/lib/seo/origin.ts`), the origin the root layout's `metadataBase` uses.
- **A draft or anything of an inactive store is never listed.** Every read goes through `src/server/services/seo.ts`, whose queries hold that rule (its integration test proves it); a new surface reads from there, never from the catalog's admin queries. An unknown or inactive store's `llms.txt` is a 404.
- **The sitemap and `llms.txt` read at request time** (`connection()`, and a route with a dynamic store), so a new article is listed at once and the build needs no database. While the storefront is closed the sitemap is empty and the proxy sends `llms.txt` to the coming-soon page; `robots.txt` is served either way.

## Admin pages

- **Every admin page checks for itself** (FER-013), inside its `<Suspense>` boundary and above any data: `requireAdmin(returnTo, locale)` (`src/lib/admin/access.ts`) answers the login (`admin.me`: the role from the database, the stores it may open) or redirects to `/admin/sign-in?next=<returnTo>`; `requireStoreSegment(segment)` turns the URL's store segment into a slug or `notFound()` before anything else reads it, and `requireAdminStore(me, slug)` finds that store among the ones the login may open or calls `notFound()`. A platform page also calls `notFound()` for any role but `superadmin`. The `admin` layout only sets the metadata (no index).
- **The page renders `organisms/admin-shell`** from what those checks returned, so the navigation can never show more than the procedures allow; the navigation is not the authorization.
- **Params are read inside the boundary.** The store and the section are per request, so the page component passes `params` into its resolver; the fallback is `molecules/admin-shell-skeleton`, a client component that reads the language from the provider.
- **A refused admin page renders the not-found page with a 200.** The check happens after the shell started streaming (the session is a request-time read), so the status is committed; what the user sees, and what the e2e asserts, is the not-found page.
- **`?next=` is untrusted:** `safeReturnPath` (`src/lib/admin/paths.ts`) keeps it only when it is an admin page of this site, never the sign-in page or another host.

## Navigation

- **After signing in, signing up or signing out, navigate with a full page load** (`window.location.assign(target)`), never `router.refresh()`/`router.push()`. A soft navigation can keep a shell rendered for the old session, or settle on the URL of a server-redirect chain without its content.
- **Changing language is a soft navigation** (`molecules/locale-toggle` is a `<Link>`): the `[locale]` layout re-renders under the new param, `<html lang>` updates and the theme class stays.
- **Routes stay mounted.** Cache Components keeps a route you navigate away from inside React's `<Activity mode="hidden">`: its state survives, its effects are cleaned up and re-run on return, and its DOM stays in the document, so a global `:has()` selector or a `document.querySelector` can match a hidden tree.

## React Compiler

- Components are memoized automatically; don't add `useMemo`/`useCallback` for render cost.
- A component that reads a library's mutable instance during render (TanStack Table's `getRowModel()`, `getHeaderGroups()`) starts with `"use no memo"`: the compiler cannot see the mutation and skips the re-render.
- react-hook-form: bind fields through `<FormField>` (a `Controller`, re-registered by its own hook), never a `{...register("field")}` spread: `reset()` forgets every registered field, a memoized spread never registers it again, and what the user types next is lost on submit. Read form state with `useFormState`/`useWatch`, never `form.formState`/`form.watch()`: a read off the stable `form` object is memoized and goes stale. A form whose schema changes is keyed and remounted, not reset. The escape hatch for a library the compiler cannot follow is `"use no memo"` as the component's first statement.
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

`src/proxy.ts` (formerly `middleware.ts`) does three things and decides no access: it stamps `/api` requests with a request id for logging, it sends page requests to `/coming-soon` with a 307 while the launch switch is off (`src/lib/env/launch.ts`; the admin and the API are never behind it), and it routes page requests by language (`docs/agents/i18n.md`): unprefixed paths are rewritten to `/es/...`, `/es/...` redirects to the unprefixed URL, `/en/...` passes through. Its `matcher` is one constant pattern that leaves out Next's assets, Vercel's endpoints, the Sentry tunnel, the generated brand images, the root metadata routes (`/robots.txt`, `/sitemap.xml`: rewritten to `/es/...` they would be a 404) and the files in `public/`, by name or by folder; a new top-level path that must not get a language is added there. If it ever redirects on a session cookie, that is optimistic only: pages and procedures still check the session themselves.

`usePathname()` can return the rewritten path (`/es/...`) on the server and the browser's on the client. Render only what does not depend on that prefix: the result of `localizePath()`, or the `pathname` `splitLocale()` returns. Never the `locale` it returns (`"es"` for the rewritten path, `null` for the browser's): the page's language comes from `useLocale()`.
