"use client";

import { createContext, type ReactNode, useMemo } from "react";

import type { Dictionary } from "@/content";

import type { Locale } from "./config";

export interface I18nContextValue {
  dictionary: Dictionary;
  locale: Locale;
}

/** `null` outside the provider, so a missing provider fails loudly. */
export const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps extends I18nContextValue {
  children: ReactNode;
}

/**
 * Hands the request's locale and its dictionary to client components, which
 * read them with `useLocale` and `useDictionary`. The root layout resolves
 * both on the server from the URL, so a client component never imports a
 * dictionary itself: only the language being shown reaches the browser.
 */
export function I18nProvider({
  children,
  dictionary,
  locale,
}: I18nProviderProps) {
  const value = useMemo(() => ({ dictionary, locale }), [dictionary, locale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}
