"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** A link of the group: the group's own page, or one of its categories. */
export interface StoreNavGroupLink {
  /** This page is the link's: `aria-current="page"`. */
  current: boolean;
  href: string;
  /** The language its name is in, when it may differ from the page's. */
  lang: string;
  name: string;
}

export interface StoreNavGroupProps {
  className?: string;
  /** The group's own page, which its name links to. */
  group: StoreNavGroupLink;
  /** Its categories, in the store's order. */
  items: readonly StoreNavGroupLink[];
  /** The button's name, which says whose categories it shows. */
  toggleLabel: string;
  /**
   * `bar`: the header's line on a computer, the categories in a panel that
   * drops under the header. `menu`: the phone's menu, the categories
   * unfolding in place under the group.
   */
  variant: "bar" | "menu";
}

const NAME_CLASS = {
  bar: "inline-flex min-h-11 items-center font-display text-xs font-extrabold whitespace-nowrap text-store-accent uppercase underline-offset-6 decoration-2 hover:underline aria-[current=page]:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
  menu: "flex min-h-13 min-w-0 flex-1 items-center font-display text-lg font-extrabold wrap-anywhere text-store-accent uppercase aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
} as const;

const ITEM_CLASS = {
  bar: "flex min-h-11 items-center px-5 font-display text-xs font-extrabold whitespace-nowrap text-store-accent uppercase hover:bg-store-accent/15 aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-store-accent",
  menu: "flex min-h-11 items-center pl-5 font-display text-base font-extrabold wrap-anywhere text-store-background uppercase aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
} as const;

/**
 * A group in the store's navigation (FER-043): its name, a link to its own
 * page, and beside it a disclosure button that shows its categories. Before
 * the page's script runs the name is the way in; the button then opens and
 * closes the list (`aria-expanded`), by mouse, touch or keyboard. Escape
 * closes it and gives focus back to the button. On the header's line the
 * list drops under the header and closes when focus or a click goes
 * elsewhere, or a link in it is followed; in the phone's menu it unfolds in
 * place. Its links are in the HTML even while closed (`hidden`), so a
 * crawler that runs no script reads them.
 */
function StoreNavGroup({
  className,
  group,
  items,
  toggleLabel,
  variant,
}: StoreNavGroupProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // While the list is open: Escape closes it and gives focus back to the
  // button; on the header's line a click, a touch or focus outside the
  // group closes it too, as a menu bar's does. In the phone's menu the list
  // stays until it is closed by hand.
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const outside = (target: EventTarget | null) =>
      target instanceof Node && !root.current?.contains(target);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !outside(event.target)) {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onAway = (event: Event) => {
      if (variant === "bar" && outside(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onAway);
    document.addEventListener("focusin", onAway);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onAway);
      document.removeEventListener("focusin", onAway);
    };
  }, [open, variant]);

  return (
    <div
      className={cn(
        variant === "bar"
          ? "relative flex items-center gap-0.5"
          : "flex flex-col",
        className
      )}
      data-slot="store-nav-group"
      data-state={open ? "open" : "closed"}
      data-variant={variant}
      ref={root}
    >
      <div
        className={cn(
          "flex items-center",
          variant === "menu" && "border-b border-store-background/15"
        )}
      >
        <Link
          aria-current={group.current ? "page" : undefined}
          className={NAME_CLASS[variant]}
          href={group.href}
          lang={group.lang}
        >
          {group.name}
        </Link>
        <button
          aria-controls={listId}
          aria-expanded={open}
          aria-label={toggleLabel}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full text-store-accent hover:bg-store-accent/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
            variant === "bar" ? "-mr-3 size-11" : "size-11"
          )}
          data-slot="store-nav-group-toggle"
          onClick={() => {
            setOpen((was) => !was);
          }}
          ref={button}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </button>
      </div>
      {/* On the line it hangs from the header's lower edge: the line is
          76 px tall and the link 44 px, so 16 px under the link. */}
      <ul
        className={cn(
          variant === "bar"
            ? "absolute top-full left-0 z-50 mt-4 min-w-56 bg-store-contrast py-2 shadow-lg"
            : "flex flex-col border-b border-store-background/15 py-2"
        )}
        data-slot="store-nav-group-list"
        hidden={!open}
        id={listId}
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link
              aria-current={item.current ? "page" : undefined}
              className={ITEM_CLASS[variant]}
              href={item.href}
              lang={item.lang}
              onClick={() => {
                setOpen(false);
              }}
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { StoreNavGroup };
