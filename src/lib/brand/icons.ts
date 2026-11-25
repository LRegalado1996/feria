import type { Metadata } from "next";

import { STORE_THEME } from "@/styles/theme";

import { wrapPngInIco } from "./ico";
import { renderLogoImage } from "./logo-image";

/**
 * The site's icons, each at a fixed address: a search engine fetches the
 * icon on a slow crawl of its own and wants a URL that never changes, where
 * Next's `icon.tsx` convention adds a query hashed from the file, so every
 * edit of it moves the icon to a new URL.
 * Google asks for a square whose side is a multiple of 48 px. The proxy
 * leaves the three paths alone (`src/proxy.ts`).
 */
export const FAVICON = { path: "/favicon.ico", side: 48 } as const;
export const TAB_ICON = { path: "/icon.png", side: 96 } as const;
export const HOME_SCREEN_ICON = { path: "/apple-icon.png", side: 180 } as const;

/**
 * The tab icon: the mark alone (the name cannot be read this small), edge to
 * edge on nothing, so it sits on a light tab strip and a dark one alike.
 */
export function renderTabIcon(side: number) {
  return renderLogoImage({
    background: null,
    colorway: "accent",
    height: side,
    logoWidth: side,
    variant: "mark",
    width: side,
  });
}

/** The tab icon at `/favicon.ico`'s size, as an ICO file. */
export async function renderFavicon(): Promise<Response> {
  const png = await renderTabIcon(FAVICON.side).arrayBuffer();

  return new Response(wrapPngInIco(new Uint8Array(png), FAVICON.side), {
    headers: { "Content-Type": "image/x-icon" },
  });
}

/**
 * The home-screen icon. It is opaque (a phone fills transparency with a color
 * of its own) and keeps a margin, because the phone rounds its corners.
 */
export function renderHomeScreenIcon() {
  return renderLogoImage({
    background: STORE_THEME.contrast,
    colorway: "accent",
    height: HOME_SCREEN_ICON.side,
    logoWidth: 132,
    variant: "mark",
    width: HOME_SCREEN_ICON.side,
  });
}

/** The icons every page declares, for the root layout's metadata. */
export const SITE_ICONS: NonNullable<Metadata["icons"]> = {
  apple: [
    {
      sizes: `${HOME_SCREEN_ICON.side}x${HOME_SCREEN_ICON.side}`,
      type: "image/png",
      url: HOME_SCREEN_ICON.path,
    },
  ],
  icon: [
    {
      sizes: `${FAVICON.side}x${FAVICON.side}`,
      type: "image/x-icon",
      url: FAVICON.path,
    },
    {
      sizes: `${TAB_ICON.side}x${TAB_ICON.side}`,
      type: "image/png",
      url: TAB_ICON.path,
    },
  ],
};
