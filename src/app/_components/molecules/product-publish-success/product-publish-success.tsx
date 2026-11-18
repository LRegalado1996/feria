"use client";

import { Check, ExternalLink, List, Plus } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type Ref, useId } from "react";

import { Button } from "@/app/_components/atoms/button";
import { CopyLinkButton } from "@/app/_components/molecules/copy-link-button";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface ProductPublishSuccessProps {
  /** The page's own path in the store, in the admin's language. */
  articlePath: string;
  className?: string;
  /** The heading, focused once the success shows. */
  headingRef?: Ref<HTMLHeadingElement>;
  listHref: string;
  newHref: string;
  title: string;
}

/** The confetti's directions around the check, in degrees. */
const CONFETTI = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/** A piece of confetti's direction, which its keyframes read. */
type ConfettiStyle = CSSProperties & { "--wizard-confetti-angle"?: string };

function confettiStyle(angle: number): ConfettiStyle {
  return { "--wizard-confetti-angle": `${angle}deg` };
}

/**
 * The moment an article is published (FER-017): a check that pops with a
 * ring of confetti, once (CSS only; nothing moves under reduced motion),
 * the article's name, and what comes next: see it in the store, copy its
 * link to send it, load another, or go back to the list.
 */
function ProductPublishSuccess({
  articlePath,
  className,
  headingRef,
  listHref,
  newHref,
  title,
}: ProductPublishSuccessProps) {
  const copy = useDictionary().articles.wizard.success;
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "grid justify-items-center gap-4 rounded-lg border bg-card px-4 py-10 text-center text-card-foreground md:p-12",
        className
      )}
      data-slot="product-publish-success"
      data-testid="product-publish-success"
    >
      <div
        aria-hidden
        className="relative flex size-16 items-center justify-center"
      >
        {CONFETTI.map((angle, index) => (
          <span
            className={cn(
              "absolute size-2 rounded-full opacity-0 motion-safe:animate-wizard-confetti",
              index % 2 === 0 ? "bg-emerald-500" : "bg-foreground"
            )}
            key={angle}
            style={confettiStyle(angle)}
          />
        ))}
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-600 text-white motion-safe:animate-wizard-pop">
          <Check className="size-8" strokeWidth={3} />
        </span>
      </div>
      <h2
        className="text-lg font-semibold outline-none md:text-xl"
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
      >
        {copy.title}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {interpolate(copy.body, { title })}
      </p>
      <div className="grid w-full max-w-sm gap-2">
        <Button asChild className="w-full">
          <a href={articlePath} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden />
            {copy.view}
          </a>
        </Button>
        <CopyLinkButton
          className="w-full"
          labels={{
            copied: copy.copied,
            copy: copy.copy,
            field: copy.field,
            manual: copy.manual,
          }}
          path={articlePath}
        />
        <Button asChild className="w-full" variant="outline">
          <Link href={newHref}>
            <Plus aria-hidden />
            {copy.another}
          </Link>
        </Button>
        <Button asChild className="w-full" variant="ghost">
          <Link href={listHref}>
            <List aria-hidden />
            {copy.list}
          </Link>
        </Button>
      </div>
    </section>
  );
}

export { ProductPublishSuccess };
