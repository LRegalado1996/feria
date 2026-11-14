"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/app/_components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/app/_components/molecules/dropdown-menu";
import { useDictionary } from "@/lib/hooks/i18n";

// Each value is also its label's key in the `theme` dictionary.
const THEMES = ["light", "dark", "system"] as const;

/**
 * Light, dark or the system's choice. The icon follows the applied theme
 * through CSS alone, so the server's markup matches the first client render
 * whatever the stored choice; the menu, which reads it, renders only on open.
 */
function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const labels = useDictionary().theme;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={labels.change}
          data-slot="theme-toggle"
          data-testid="theme-toggle"
          size="icon-sm"
          variant="ghost"
        >
          <Sun
            aria-hidden="true"
            className="size-4 scale-100 rotate-0 transition-all motion-reduce:transition-none dark:scale-0 dark:-rotate-90"
          />
          <Moon
            aria-hidden="true"
            className="absolute size-4 scale-0 rotate-90 transition-all motion-reduce:transition-none dark:scale-100 dark:rotate-0"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            // Radix hands back any string; only a known theme is applied.
            if (THEMES.some((known) => known === value)) {
              setTheme(value);
            }
          }}
          value={theme}
        >
          {THEMES.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {labels[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ThemeToggle };
