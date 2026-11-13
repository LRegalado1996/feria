import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { connection } from "next/server";
import { Suspense } from "react";

import { AuthForm } from "@/app/_components/organisms/auth-form";
import { Navbar } from "@/app/_components/organisms/navbar";
import { PostFeed } from "@/app/_components/organisms/post-feed";
import { getQueryClient, orpc } from "@/lib/orpc/server";
import type { GetPostsValues } from "@/lib/schemas/post";
import { getGravatarUrl } from "@/lib/utils/get-gravatar-url";
import { getSession } from "@/server/better-auth/server";

/**
 * The shell is static and prerendered; whether the visitor sees the sign-in
 * form or the feed depends on the session, a request-time read, so that
 * decision happens inside the boundary (docs/agents/nextjs.md § Layouts and
 * pages).
 */
export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeResolver />
    </Suspense>
  );
}

/**
 * Both outcomes share nothing visible, so the fallback is an empty canvas
 * rather than one of them: a feed skeleton would lie to a signed-out visitor.
 */
function HomeSkeleton() {
  return (
    <div aria-busy="true" className="min-h-screen" data-testid="home-skeleton">
      <output className="sr-only">Loading</output>
    </div>
  );
}

/**
 * The instant the feed's relative times ("5 minutes ago") are computed against,
 * on the server and again while the page hydrates, so both renders print the
 * same text. Reading the clock is request-time IO, hence `connection()`.
 */
async function readRenderInstant() {
  await connection();
  return Date.now();
}

export async function HomeResolver() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm space-y-6 px-4">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>
          <AuthForm />
        </div>
      </div>
    );
  }

  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the feed refetches on the client and
  // renders its own error state. `.catch(noop)` is TanStack's replacement for
  // the deprecated `prefetchInfiniteQuery`, which swallowed the error the same way.
  await queryClient
    .infiniteQuery(
      orpc.post.getAll.infiniteOptions({
        input: (pageParam) => ({ cursor: pageParam }),
        initialPageParam: undefined as GetPostsValues["cursor"],
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      })
    )
    .catch(noop);

  const renderedAt = await readRenderInstant();
  const user = {
    id: session.user.id,
    name: session.user?.name ?? "User",
    image: session.user?.image ?? getGravatarUrl(session.user?.email ?? ""),
  };

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mx-auto flex min-h-screen max-w-xl flex-col border-x">
        <Navbar user={user} />

        <PostFeed currentUser={user} renderedAt={renderedAt} />
      </div>
    </HydrationBoundary>
  );
}
