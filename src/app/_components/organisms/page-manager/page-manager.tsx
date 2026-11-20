"use client";

import { ORPCError } from "@orpc/client";
import { ExternalLink, House, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import {
  PageForm,
  type PageFormOutcome,
} from "@/app/_components/molecules/page-form";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/_components/molecules/sheet";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import {
  type PageRow,
  useCreatePage,
  useDeletePage,
  usePages,
  useSetHomePage,
} from "@/lib/hooks/page";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import type { PageFormValues } from "@/lib/schemas/page";

/** A page's name in `locale`, else its Spanish one. */
function nameOf(page: PageRow, locale: Locale): string {
  return locale === "en" && page.nameEn !== null ? page.nameEn : page.nameEs;
}

/** How a write ended, a taken address apart. */
function outcomeOf(error: unknown): PageFormOutcome {
  return error instanceof ORPCError && error.code === "CONFLICT"
    ? "taken"
    : "failed";
}

const CHIP = "rounded-full px-2 py-0.5";
const CHIP_ON =
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
const CHIP_OFF = "bg-muted text-muted-foreground";

/**
 * One page of the list: its name and address, its marks (the home, its
 * status, the header), and what can be done with it, each named with the
 * page. The home cannot be deleted, and says why where the button would
 * be; a draft cannot be the home, and says so.
 */
function PageItem({
  locale,
  onDelete,
  onSetHome,
  page,
}: {
  locale: Locale;
  onDelete: (opener: HTMLButtonElement) => void;
  onSetHome: (opener: HTMLButtonElement) => void;
  page: PageRow;
}) {
  const { admin, storefront } = useDictionary();
  const copy = admin.pages;
  const name = nameOf(page, locale);
  const address = page.isHome ? "/" : `/${page.slug}`;

  return (
    <li
      className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center"
      data-home={page.isHome}
      data-testid="page-row"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {page.isHome ? (
            <House aria-hidden="true" className="size-4 shrink-0" />
          ) : null}
          <span className="truncate">{name}</span>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{address}</span>
          {page.isHome ? (
            <span className={`${CHIP} ${CHIP_ON}`} data-testid="page-home-mark">
              {copy.homeMark}
            </span>
          ) : null}
          <span
            className={`${CHIP} ${page.isPublished ? CHIP_ON : CHIP_OFF}`}
            data-testid="page-status"
          >
            {page.isPublished ? copy.published : copy.draft}
          </span>
          {page.showInHeader && !page.isHome ? (
            <span className={`${CHIP} ${CHIP_OFF}`}>{copy.inHeader}</span>
          ) : null}
        </p>
        {page.isHome ? (
          <p className="text-xs text-muted-foreground">
            {copy.homeCannotBeDeleted}
          </p>
        ) : null}
        {page.isHome || page.isPublished ? null : (
          <p className="text-xs text-muted-foreground">
            {copy.draftCannotBeHome}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {page.isHome || !page.isPublished ? null : (
          <Button
            aria-label={interpolate(copy.useAsHomeNamed, { name })}
            onClick={(event) => {
              onSetHome(event.currentTarget);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <House aria-hidden="true" />
            {copy.useAsHome}
          </Button>
        )}
        <Button asChild size="icon-sm" variant="ghost">
          <Link
            aria-label={interpolate(copy.edit, { name })}
            href={localizePath(`/admin/pages/${String(page.id)}`, locale)}
          >
            <Pencil aria-hidden="true" />
          </Link>
        </Button>
        {page.isPublished ? (
          <Button asChild size="icon-sm" variant="ghost">
            <a
              href={localizePath(address, locale)}
              rel="noopener"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" />
              {/* Its name says the tab it opens, as the storefront's do. */}
              <span className="sr-only">
                {interpolate(copy.view, { name })} {storefront.shell.newTab}
              </span>
            </a>
          </Button>
        ) : null}
        {page.isHome ? null : (
          <Button
            aria-label={interpolate(copy.delete, { name })}
            onClick={(event) => {
              onDelete(event.currentTarget);
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * The store's pages (FER-060) in the admin's shell and cards: the home
 * first and marked, then the rest; "Nueva página" opens its settings in a
 * side sheet and, once created, its editor; "Usar como home" and deleting
 * ask first. Each change says how it ended in a toast and focus goes back
 * to what opened it, or to "Nueva página" once its row is gone.
 */
function PageManager() {
  const { admin, common } = useDictionary();
  const copy = admin.pages;
  const locale = useLocale();
  const router = useRouter();
  const pages = usePages();
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const setHome = useSetHomePage();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PageRow | null>(null);
  const [choosing, setChoosing] = useState<PageRow | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const create = async (values: PageFormValues): Promise<PageFormOutcome> => {
    try {
      const created = await createPage.mutateAsync(values);
      toast.success(copy.form.created);
      setCreating(false);
      router.push(localizePath(`/admin/pages/${String(created.id)}`, locale));

      return "saved";
    } catch (error) {
      const outcome = outcomeOf(error);

      if (outcome === "failed") {
        reportError(error, { action: "Pages.create_page" });
      }

      return outcome;
    }
  };

  const remove = async (page: PageRow) => {
    try {
      await deletePage.mutateAsync({ id: page.id });
      toast.success(copy.deleted);
    } catch (error) {
      reportError(error, { action: "Pages.delete_page" });
      toast.error(copy.errors.delete);
    }

    setDeleting(null);
  };

  const chooseHome = async (page: PageRow) => {
    try {
      await setHome.mutateAsync({ pageId: page.id });
      toast.success(
        interpolate(copy.homeChanged, { name: nameOf(page, locale) })
      );
    } catch (error) {
      reportError(error, { action: "Pages.set_home" });
      toast.error(copy.errors.setHome);
    }

    setChoosing(null);
  };

  const focusBack = (event: Event) => {
    event.preventDefault();
    const target = opener.current?.isConnected
      ? opener.current
      : addButton.current;
    target?.focus();
  };

  return (
    <section data-slot="page-manager" data-testid="page-manager">
      <AdminPage
        primaryAction={
          <Button
            className="w-full md:w-auto"
            data-testid="page-add"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setCreating(true);
            }}
            ref={addButton}
            type="button"
          >
            <Plus aria-hidden="true" />
            {copy.add}
          </Button>
        }
        title={copy.title}
      >
        <p className="text-sm text-muted-foreground">{copy.description}</p>
        {pages.data ? (
          <div className="rounded-lg border bg-card p-4 text-card-foreground md:p-5">
            {pages.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy.empty}</p>
            ) : (
              <ul className="divide-y" data-testid="page-list">
                {pages.data.map((page) => (
                  <PageItem
                    key={page.id}
                    locale={locale}
                    onDelete={(button) => {
                      opener.current = button;
                      setDeleting(page);
                    }}
                    onSetHome={(button) => {
                      opener.current = button;
                      setChoosing(page);
                    }}
                    page={page}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {pages.isError ? (
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
            <p className="text-sm">{copy.errors.load}</p>
            <Button
              onClick={() => {
                void pages.refetch();
              }}
              size="sm"
              variant="outline"
            >
              {common.tryAgain}
            </Button>
          </div>
        ) : null}
        {pages.isPending ? (
          <div aria-busy="true" data-testid="page-manager-skeleton">
            <span className="sr-only">{common.loading}</span>
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : null}
      </AdminPage>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
          }
        }}
        open={creating}
      >
        <SheetContent data-testid="page-sheet" onCloseAutoFocus={focusBack}>
          <SheetHeader closeLabel={copy.form.close}>
            <SheetTitle>{copy.form.createTitle}</SheetTitle>
            <SheetDescription>{copy.form.description}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {creating ? (
              <PageForm
                onCancel={() => {
                  setCreating(false);
                }}
                onSave={create}
                page={null}
              />
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        confirmLabel={copy.useAsHomeConfirm}
        confirmVariant="default"
        description={interpolate(copy.useAsHomeDescription, {
          name: choosing ? nameOf(choosing, locale) : "",
        })}
        isPending={setHome.isPending}
        onCloseAutoFocus={focusBack}
        onConfirm={() => {
          if (choosing) {
            void chooseHome(choosing);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setChoosing(null);
          }
        }}
        open={choosing !== null}
        pendingLabel={copy.useAsHomePending}
        title={interpolate(copy.useAsHomeTitle, {
          name: choosing ? nameOf(choosing, locale) : "",
        })}
      />
      <ConfirmDialog
        confirmLabel={copy.deleteConfirm}
        description={interpolate(copy.deleteDescription, {
          name: deleting ? nameOf(deleting, locale) : "",
        })}
        isPending={deletePage.isPending}
        onCloseAutoFocus={focusBack}
        onConfirm={() => {
          if (deleting) {
            void remove(deleting);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        open={deleting !== null}
        pendingLabel={copy.deletePending}
        title={copy.deleteTitle}
      />
    </section>
  );
}

export { PageManager };
