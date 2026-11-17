import type { Viewport } from "next";
import type { ReactNode } from "react";

import { StoreTheme } from "@/app/_components/organisms/store-theme";
import { STORE_THEME } from "@/styles/theme";

interface StoreLayoutProps {
  children: ReactNode;
}

/** The browser's bar takes the header's moss, the top of every store page. */
export const viewport: Viewport = { themeColor: STORE_THEME.contrast };

/**
 * Every page of the store (FER-021, FER-038), on the store's canvas. Chrome
 * only, and only the canvas: each page renders its own frame (the bar, the
 * header and the footer, `organisms/store-frame`), because the bar's words
 * and the header's categories come from the database, which this layout must
 * not read: it is prerendered with the build, and an article's static page
 * renders it too (docs/agents/nextjs.md § Store pages).
 */
export default function StoreLayout({ children }: StoreLayoutProps) {
  return (
    <StoreTheme className="flex min-h-dvh flex-col" data-testid="store-theme">
      {children}
    </StoreTheme>
  );
}
