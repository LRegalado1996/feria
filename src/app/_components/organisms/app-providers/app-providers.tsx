"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { Toaster } from "@/app/_components/molecules/sonner";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/provider";
import { ORPCReactProvider } from "@/lib/orpc/client";

export interface AppProvidersProps {
  children: ReactNode;
  /** The interface text of `locale`, resolved on the server. */
  dictionary: Dictionary;
  locale: Locale;
}

/**
 * Every client-side provider the app needs, mounted once by the root layout:
 * the page's language and its text, the theme (a `.dark` class on <html>,
 * following the system until the user picks), the query client, and the one
 * toast region.
 */
export function AppProviders({
  children,
  dictionary,
  locale,
}: AppProvidersProps) {
  return (
    <I18nProvider dictionary={dictionary} locale={locale}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
      >
        <ORPCReactProvider>
          <div className="contents" data-slot="app-providers">
            {children}
          </div>
        </ORPCReactProvider>
        <Toaster />
      </ThemeProvider>
    </I18nProvider>
  );
}
