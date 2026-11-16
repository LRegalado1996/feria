"use client";

import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/_components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/_components/molecules/dropdown-menu";
import { cn } from "@/lib/utils";

export interface StoreSwitcherProps {
  className?: string;
  /** The store being worked on, or `null` outside any store. */
  current: { name: string; slug: string } | null;
  /** The trigger's accessible name, the current store already in it. */
  label: string;
  /** Each store the login may open, with the address to open it at. */
  stores: { href: string; name: string; slug: string }[];
  /** What the trigger shows outside any store. */
  title: string;
}

/**
 * A menu of the stores the login may work on; each item is a link, so it
 * opens in a new tab too. The current one is marked with `aria-current`.
 */
function StoreSwitcher({
  className,
  current,
  label,
  stores,
  title,
}: StoreSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className={cn("max-w-48 min-w-0 justify-between", className)}
          data-slot="store-switcher"
          data-testid="store-switcher"
          size="sm"
          variant="ghost"
        >
          <span className="truncate font-semibold">
            {current?.name ?? title}
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {stores.map((store) => (
          <DropdownMenuItem asChild key={store.slug}>
            <Link
              aria-current={store.slug === current?.slug ? "page" : undefined}
              href={store.href}
            >
              <span className="truncate">{store.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { StoreSwitcher };
