"use client";

import { ArrowLeft, ExternalLink, Lock, Store } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import {
  type ComingSoonDefaults,
  ComingSoonForm,
  type ComingSoonFormPage,
} from "@/app/_components/molecules/coming-soon-form";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import { adminSectionPath } from "@/lib/admin/paths";
import { COMING_SOON_PATH } from "@/lib/coming-soon/paths";
import { reportError } from "@/lib/errors/client";
import {
  useComingSoon,
  useSetComingSoonPublished,
  useUpdateComingSoon,
} from "@/lib/hooks/coming-soon";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** The cards the screen fills, as their skeleton holds their place. */
const SKELETON_CARDS = [
  ["status", "h-40"],
  ["es", "h-96"],
  ["en", "h-96"],
] as const;

// The status chip recipe (design.md § Color and surfaces), as the orders'
// statuses: closed reads amber, open emerald, each with its icon and name.
const STATES = {
  closed: {
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    icon: Lock,
  },
  open: {
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    icon: Store,
  },
} as const;

export interface ComingSoonManagerProps {
  /** What the page says where a field is empty, per language. */
  defaults: ComingSoonDefaults;
}

/** The switch's card: the page's state in words, and the one move it has. */
function StatusCard({ page }: { page: ComingSoonFormPage }) {
  const { comingSoon, storefront } = useDictionary();
  const locale = useLocale();
  const copy = comingSoon.manage;
  const setPublished = useSetComingSoonPublished();
  const [confirming, setConfirming] = useState(false);
  const moveRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const hydrated = useHydrated();
  const state = STATES[page.published ? "closed" : "open"];
  const Icon = state.icon;

  const move = async (published: boolean) => {
    try {
      await setPublished.mutateAsync({ published });
      toast.success(
        published ? copy.status.publishedToast : copy.status.unpublishedToast
      );
    } catch (error) {
      reportError(error, { action: "ComingSoon.set_published" });
      toast.error(copy.errors.publish);
    }

    setConfirming(false);
  };

  // Opening the store says so while it travels; publishing says it in its
  // confirmation, which stays open until the answer.
  let moveLabel: string = copy.status.publish;

  if (page.published) {
    moveLabel = setPublished.isPending
      ? copy.status.unpublishing
      : copy.status.unpublish;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
      data-slot="coming-soon-status"
      data-testid="coming-soon-status"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" id={headingId}>
          {copy.status.heading}
        </h2>
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap",
            state.className
          )}
          data-published={page.published}
          data-testid="coming-soon-state"
        >
          <Icon aria-hidden="true" className="size-4" />
          {page.published ? copy.status.published : copy.status.unpublished}
        </span>
      </div>
      <p className="text-sm">
        {page.published
          ? copy.status.publishedHint
          : copy.status.unpublishedHint}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {/* While a flip travels the button is `aria-disabled`, not
            `disabled`, so a keyboard press keeps focus on it; a second press
            is dropped here. */}
        <Button
          aria-disabled={setPublished.isPending || undefined}
          className="w-full aria-disabled:opacity-50 sm:w-auto"
          disabled={!hydrated}
          onClick={() => {
            if (setPublished.isPending) {
              return;
            }

            if (page.published) {
              void move(false);
            } else {
              setConfirming(true);
            }
          }}
          ref={moveRef}
          type="button"
          variant={page.published ? "default" : "outline"}
        >
          {moveLabel}
        </Button>
        {/* A plain link in a new tab, never Next's: nothing is fetched
            ahead. An admin sees the page even while it is not published. */}
        <Button asChild className="w-full sm:w-auto" variant="ghost">
          <a
            href={localizePath(COMING_SOON_PATH, locale)}
            rel="noopener"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" />
            {copy.preview}
            <span className="sr-only"> {storefront.shell.newTab}</span>
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{copy.status.delay}</p>
      <ConfirmDialog
        confirmLabel={copy.confirm.confirm}
        confirmVariant="default"
        description={copy.confirm.description}
        isPending={setPublished.isPending}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          moveRef.current?.focus();
        }}
        onConfirm={() => {
          void move(true);
        }}
        onOpenChange={setConfirming}
        open={confirming}
        pendingLabel={copy.status.publishing}
        title={copy.confirm.title}
      />
    </section>
  );
}

/**
 * The coming-soon page's screen (FER-034): the switch first, its state in
 * words and in a chip, publishing only after a confirmation since it hides
 * the whole store from the public, and a link to the page itself; then its
 * texts in both languages and the countdown's day, saved from the top bar's
 * button (under the thumb on a phone). Each change says how it ended in a
 * toast; a failed one is reported and leaves the screen as it was.
 */
function ComingSoonManager({ defaults }: ComingSoonManagerProps) {
  const { comingSoon, common } = useDictionary();
  const locale = useLocale();
  const copy = comingSoon.manage;
  const page = useComingSoon();
  const update = useUpdateComingSoon();
  const formId = useId();
  // Before React owns the form, a press would submit it the browser's way,
  // the texts in the address.
  const hydrated = useHydrated();

  return (
    <section data-slot="coming-soon-manager" data-testid="coming-soon-manager">
      <AdminPage
        primaryAction={
          page.data ? (
            <Button
              className="w-full md:w-auto"
              disabled={!hydrated || update.isPending}
              form={formId}
              type="submit"
            >
              {update.isPending ? copy.pending : copy.submit}
            </Button>
          ) : undefined
        }
        title={copy.title}
      >
        {/* The screen lives under the settings, which the navigation marks. */}
        <Link
          className="inline-flex h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-9"
          href={adminSectionPath("settings", locale)}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {copy.back}
        </Link>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
        {page.isPending ? (
          <div
            aria-busy="true"
            className="space-y-6"
            data-testid="coming-soon-skeleton"
          >
            <span className="sr-only">{common.loading}</span>
            {SKELETON_CARDS.map(([card, height]) => (
              <Skeleton className={`${height} w-full rounded-lg`} key={card} />
            ))}
          </div>
        ) : null}
        {page.isError && !page.data ? (
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
            <p className="text-sm">{copy.errors.load}</p>
            <Button
              onClick={() => {
                void page.refetch();
              }}
              size="sm"
              variant="outline"
            >
              {common.tryAgain}
            </Button>
          </div>
        ) : null}
        {page.data ? (
          <div className="flex flex-col gap-6">
            <StatusCard page={page.data} />
            <ComingSoonForm
              defaults={defaults}
              id={formId}
              onSave={async (values) => {
                try {
                  const saved = await update.mutateAsync(values);
                  toast.success(copy.saved);
                  return saved;
                } catch (error) {
                  reportError(error, { action: "ComingSoon.update_texts" });
                  toast.error(copy.errors.save);
                  return null;
                }
              }}
              page={page.data}
            />
          </div>
        ) : null}
      </AdminPage>
    </section>
  );
}

export { ComingSoonManager };
