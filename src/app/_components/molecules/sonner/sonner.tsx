"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// The palette travels as CSS custom properties, which `CSSProperties` alone
// cannot describe.
const TOASTER_STYLE: React.CSSProperties & Record<`--${string}`, string> = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
};

const TOASTER_THEMES = ["light", "dark", "system"] as const;

// `useTheme` reports any string the app has registered; sonner accepts three.
function isToasterTheme(
  theme: string
): theme is NonNullable<ToasterProps["theme"]> {
  return TOASTER_THEMES.some((known) => known === theme);
}

/**
 * The app's one toast region, themed by the design tokens. A toast tells the
 * user what happened; reporting an error is a separate call.
 */
function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      className="toaster group"
      data-slot="toaster"
      icons={{
        success: <CircleCheckIcon aria-hidden="true" className="size-4" />,
        info: <InfoIcon aria-hidden="true" className="size-4" />,
        warning: <TriangleAlertIcon aria-hidden="true" className="size-4" />,
        error: <OctagonXIcon aria-hidden="true" className="size-4" />,
        loading: (
          <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
        ),
      }}
      style={TOASTER_STYLE}
      theme={isToasterTheme(theme) ? theme : "system"}
      {...props}
    />
  );
}

export { Toaster };
