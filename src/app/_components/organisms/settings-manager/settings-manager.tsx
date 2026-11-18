"use client";

import { useId } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import { SettingsForm } from "@/app/_components/molecules/settings-form";
import { reportError } from "@/lib/errors/client";
import { useDictionary } from "@/lib/hooks/i18n";
import { useStoreSettings, useUpdateStoreSettings } from "@/lib/hooks/store";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";

/** The cards the form fills, as their skeleton holds their place. */
const SKELETON_CARDS = [
  ["identity", "h-28"],
  ["texts", "h-80"],
  ["contact", "h-56"],
] as const;

/**
 * The company's settings screen (FER-014): the store's settings in the
 * admin's cards, saved from the top bar's button (under the thumb on a
 * phone). A save says how it ended in a toast; a failed one is reported and
 * leaves the form as it was typed.
 */
function SettingsManager() {
  const { admin, common } = useDictionary();
  const copy = admin.settings;
  const settings = useStoreSettings();
  const update = useUpdateStoreSettings();
  const formId = useId();
  // Before React owns the form, a press would submit it the browser's way,
  // the settings in the address.
  const hydrated = useHydrated();

  return (
    <section data-slot="settings-manager" data-testid="settings-manager">
      <AdminPage
        primaryAction={
          settings.data ? (
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
        <p className="text-sm text-muted-foreground">{copy.description}</p>
        {settings.isPending ? (
          <div
            aria-busy="true"
            className="space-y-6"
            data-testid="settings-skeleton"
          >
            <span className="sr-only">{common.loading}</span>
            {SKELETON_CARDS.map(([card, height]) => (
              <Skeleton className={`${height} w-full rounded-lg`} key={card} />
            ))}
          </div>
        ) : null}
        {settings.isError && !settings.data ? (
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
            <p className="text-sm">{copy.errors.load}</p>
            <Button
              onClick={() => {
                void settings.refetch();
              }}
              size="sm"
              variant="outline"
            >
              {common.tryAgain}
            </Button>
          </div>
        ) : null}
        {settings.data ? (
          <SettingsForm
            id={formId}
            onSave={async (values) => {
              try {
                const saved = await update.mutateAsync(values);
                toast.success(copy.saved);
                return saved;
              } catch (error) {
                reportError(error, { action: "Store.update_settings" });
                toast.error(copy.errors.save);
                return null;
              }
            }}
            store={settings.data}
          />
        ) : null}
      </AdminPage>
    </section>
  );
}

export { SettingsManager };
