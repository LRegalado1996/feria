"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
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
  /**
   * On the header's line, the words of the list's first link, to the
   * group's own page ("Ver todo"), which the line's one control no longer
   * is once the script runs.
   */
  allLabel: string;
  className?: string;
  /** The group's own page, which its name links to. */
  group: StoreNavGroupLink;
  /** Its categories, in the store's order. */
  items: readonly StoreNavGroupLink[];
  /** The phone menu's button's name, which says whose categories it shows. */
  toggleLabel: string;
  /**
   * `bar`: the header's line on a computer, one control (the name with a
   * small chevron tight against it) that drops the categories under the
   * header. `menu`: the phone's menu, the name a link and a button beside
   * it that unfolds the categories in place under the group.
   */
  variant: "bar" | "menu";
}

/**
 * The line's one control, a link before the script runs and a button
 * after: the same box either way, so nothing moves when React takes over.
 */
const BAR_TRIGGER_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 font-display text-xs font-extrabold whitespace-nowrap text-store-accent uppercase underline-offset-6 decoration-2 hover:underline aria-[current=page]:underline data-[current=true]:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

const MENU_NAME_CLASS =
  "flex min-h-13 min-w-0 flex-1 items-center font-display text-lg font-extrabold wrap-anywhere text-store-accent uppercase aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

const ITEM_CLASS = {
  bar: "flex min-h-11 items-center px-5 font-display text-xs font-extrabold whitespace-nowrap text-store-accent uppercase hover:bg-store-accent/15 aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-store-accent",
  menu: "flex min-h-11 items-center pl-5 font-display text-base font-extrabold wrap-anywhere text-store-background uppercase aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent",
} as const;

/**
 * A group in the store's navigation (FER-043). On the header's line it is
 * one control, after the reference store's currency selector (FER-044):
 * the group's name with a small chevron tight against it. Before the
 * page's script runs that control is a link to the group's page, the way
 * in; once React owns it, it is a disclosure button (`aria-expanded`) whose
 * list starts with that page ("Ver todo") and holds its categories. In the
 * phone's menu the name stays a link and a 44 px button beside it unfolds
 * the categories in place. Escape closes the list and gives focus back to
 * the button; on the line a click or focus elsewhere, or following a link
 * in it, closes it too. Its links are in the HTML even while closed
 * (`hidden`), so a crawler that runs no script reads them.
 */
function StoreNavGroup({
  allLabel,
  className,
  group,
  items,
  toggleLabel,
  variant,
}: StoreNavGroupProps) {
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const inGroup = group.current || items.some((item) => item.current);

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

  const chevron = (
    <ChevronDown
      aria-hidden="true"
      className={cn(
        "shrink-0 transition-transform motion-reduce:transition-none",
        variant === "bar" ? "size-3" : "size-4",
        open && "rotate-180"
      )}
      data-slot="store-nav-group-chevron"
      data-testid="store-nav-group-chevron"
    />
  );
  const toggle = () => {
    setOpen((was) => !was);
  };
  const links = [
    // On the line the control opens the list, so the group's own page is
    // the list's first link; in the menu its name already is that link.
    ...(variant === "bar"
      ? [{ ...group, lang: undefined, name: allLabel }]
      : []),
    ...items,
  ];
  // The line's one control: the way in before the script runs, the
  // disclosure once React owns it.
  const barTrigger = hydrated ? (
    <button
      aria-controls={listId}
      aria-expanded={open}
      className={BAR_TRIGGER_CLASS}
      data-current={inGroup}
      data-slot="store-nav-group-toggle"
      onClick={toggle}
      ref={button}
      type="button"
    >
      <span lang={group.lang}>{group.name}</span>
      {chevron}
    </button>
  ) : (
    <Link
      aria-current={group.current ? "page" : undefined}
      className={BAR_TRIGGER_CLASS}
      data-current={inGroup}
      data-slot="store-nav-group-toggle"
      href={group.href}
    >
      <span lang={group.lang}>{group.name}</span>
      {chevron}
    </Link>
  );

  return (
    <div
      className={cn(
        variant === "bar" ? "relative flex items-center" : "flex flex-col",
        className
      )}
      data-slot="store-nav-group"
      data-state={open ? "open" : "closed"}
      data-variant={variant}
      ref={root}
    >
      {variant === "bar" ? (
        barTrigger
      ) : (
        <div className="flex items-center border-b border-store-background/15">
          <Link
            aria-current={group.current ? "page" : undefined}
            className={MENU_NAME_CLASS}
            href={group.href}
            lang={group.lang}
          >
            {group.name}
          </Link>
          <button
            aria-controls={listId}
            aria-expanded={open}
            aria-label={toggleLabel}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-store-accent hover:bg-store-accent/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent"
            data-slot="store-nav-group-toggle"
            onClick={toggle}
            ref={button}
            type="button"
          >
            {chevron}
          </button>
        </div>
      )}
      {/* On the line it hangs from the header's lower edge: the line is
          76 px tall and the control 44 px, so 16 px under the control. */}
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
        {links.map((link) => (
          <li key={link.href}>
            <Link
              aria-current={link.current ? "page" : undefined}
              className={ITEM_CLASS[variant]}
              href={link.href}
              lang={link.lang}
              onClick={() => {
                setOpen(false);
              }}
            >
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { StoreNavGroup };
