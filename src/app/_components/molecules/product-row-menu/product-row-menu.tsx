"use client";

import { Ellipsis, Eye, EyeOff, Trash2 } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/app/_components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/_components/molecules/dropdown-menu";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface ProductRowMenuProps {
  className?: string;
  /** Ask before deleting; the button is what focus goes back to. */
  onDelete: (opener: HTMLButtonElement) => void;
  /**
   * Hide a published article from the store, or show a draft in it; the
   * button is what focus is back on, unless the row leaves the list.
   */
  onToggleVisibility: (opener: HTMLButtonElement) => void;
  /** The article shows in the store: the menu offers to hide it. */
  published: boolean;
  /** Its visibility is changing: the item waits for it. */
  switching?: boolean;
  /** The article's title as the row shows it, for the button's name. */
  title: string;
}

/**
 * An article row's menu (FER-019): a quiet "⋯" that opens "Ocultar de la
 * web" on a published article ("Mostrar en la web" on a draft), at once and
 * without asking, since it undoes from the same place, and "Eliminar",
 * which asks first. It sits above the row's stretched link, so a tap on it never
 * opens the wizard. An item that asks something first keeps focus where the
 * question puts it, rather than back on this button (design.md § Focus
 * after close).
 */
function ProductRowMenu({
  className,
  onDelete,
  onToggleVisibility,
  published,
  switching = false,
  title,
}: ProductRowMenuProps) {
  const copy = useDictionary().articles.list.actions;
  const trigger = useRef<HTMLButtonElement>(null);
  const asking = useRef(false);

  const choose = (action: (opener: HTMLButtonElement) => void) => {
    const opener = trigger.current;

    if (opener) {
      asking.current = true;
      action(opener);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={interpolate(copy.menu, { title })}
          className={cn("relative z-10 text-muted-foreground", className)}
          data-slot="product-row-menu"
          data-testid="product-row-menu"
          ref={trigger}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (asking.current) {
            event.preventDefault();
            asking.current = false;
          }
        }}
      >
        <DropdownMenuItem
          data-testid="product-row-visibility"
          disabled={switching}
          onSelect={() => {
            // Focus comes back to this button on its own: nothing is asked.
            if (trigger.current) {
              onToggleVisibility(trigger.current);
            }
          }}
        >
          {published ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {published ? copy.hide : copy.show}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="product-row-delete"
          onSelect={() => {
            choose(onDelete);
          }}
          variant="destructive"
        >
          <Trash2 aria-hidden />
          {copy.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ProductRowMenu };
