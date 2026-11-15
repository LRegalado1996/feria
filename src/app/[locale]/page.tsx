import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { AuthForm } from "@/app/_components/organisms/auth-form";
import { Navbar } from "@/app/_components/organisms/navbar";
import { PostFeed } from "@/app/_components/organisms/post-feed";
import { type Dictionary, getDictionary } from "@/content";
import { buildAlternates } from "@/lib/i18n/metadata";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";
import type { GetPostsValues } from "@/lib/schemas/post";
import { getGravatarUrl } from "@/lib/utils/get-gravatar-url";
import { getSession } from "@/server/better-auth/server";

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HomeProps): Promise<Metadata> {
  return { alternates: buildAlternates("/", await readLocale(params)) };
}

/**
 * The shell is static and prerendered, once per language: the locale is a
 * build-time param, so awaiting it here holds nothing behind a request.
 * Whether the visitor sees the sign-in form or the feed depends on the
 * session, a request-time read, so that decision happens inside the boundary
 * (docs/agents/nextjs.md § Layouts and pages).
 */
export default async function Home({ params }: HomeProps) {
  const locale = await readLocale(params);
  const dictionary = getDictionary(locale);

  return (
    <Suspense fallback={<HomeSkeleton label={dictionary.common.loading} />}>
      <HomeResolver dictionary={dictionary} />
    </Suspense>
  );
}

/**
 * Both outcomes share nothing visible, so the fallback is an empty canvas
 * rather than one of them: a feed skeleton would lie to a signed-out visitor.
 */
function HomeSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="min-h-screen" data-testid="home-skeleton">
      <output className="sr-only">{label}</output>
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

export async function HomeResolver({ dictionary }: { dictionary: Dictionary }) {
  const session = await getSession();

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between p-4">
          <StoreLogo className="h-12" variant="mark" />
          <LocaleToggle />
        </header>
        <main className="flex flex-1 items-center justify-center pb-16">
          <div className="w-full max-w-sm space-y-6 px-4">
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold tracking-tight">
                {dictionary.auth.welcome.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {dictionary.auth.welcome.subtitle}
              </p>
            </div>
            <AuthForm />
          </div>
        </main>
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
    name: session.user?.name ?? dictionary.common.userFallbackName,
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
