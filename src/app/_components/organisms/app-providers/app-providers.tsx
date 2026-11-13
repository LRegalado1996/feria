"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { Toaster } from "@/app/_components/molecules/sonner";
import { ORPCReactProvider } from "@/lib/orpc/client";

export interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Every client-side provider the app needs, mounted once by the root layout:
 * the theme (a `.dark` class on <html>, following the system until the user
 * picks), the query client, and the one toast region.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
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
  );
}
