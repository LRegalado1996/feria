import { cva } from "class-variance-authority";

import { detectStableEnvironment } from "@/env-database-url";
import { cn } from "@/lib/utils";

type MarkedEnvironment = "qa" | "preview" | "development";

const LABELS: Record<MarkedEnvironment, string> = {
  qa: "QA",
  preview: "Preview",
  development: "Development",
};

const lineVariants = cva(
  // Pure paint at the top edge: it never takes a row or a click.
  "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 print:hidden",
  {
    variants: {
      environment: {
        qa: "bg-emerald-600 dark:bg-emerald-500",
        preview: "bg-blue-600 dark:bg-blue-500",
        development: "bg-zinc-500",
      },
    },
  }
);

const chipVariants = cva(
  "pointer-events-none fixed bottom-2 left-2 z-50 rounded-md px-1.5 py-0.5 text-xs font-medium select-none print:hidden",
  {
    variants: {
      // The status-chip recipe (design.md § Color and surfaces).
      environment: {
        qa: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        preview:
          "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
        development:
          "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
      },
    },
  }
);

/**
 * Which non-production environment this deployment is, or `null` for
 * production and for anything it cannot tell apart from production (a
 * self-hosted build without Vercel's variables). Vercel fixes these per
 * deployment, so reading them at build time is reading them at run time.
 */
function resolveEnvironment(): MarkedEnvironment | null {
  if (
    process.env.VERCEL_ENV === "production" ||
    detectStableEnvironment(process.env) === "production"
  ) {
    return null;
  }

  if (detectStableEnvironment(process.env) === "qa") {
    return "qa";
  }

  if (process.env.VERCEL_ENV === "preview") {
    return "preview";
  }

  return process.env.NODE_ENV === "development" ? "development" : null;
}

/**
 * Marks every non-production deployment: a 2px line along the top edge and a
 * chip naming the environment, so the marker is never color alone. Production
 * renders nothing; a bare edge means the real thing. Mounted first in <body>.
 */
function EnvironmentMarker({ className }: { className?: string }) {
  const environment = resolveEnvironment();

  if (!environment) {
    return null;
  }

  return (
    <div
      className={cn("contents", className)}
      data-environment={environment}
      data-slot="environment-marker"
      data-testid="environment-marker"
    >
      <div aria-hidden="true" className={lineVariants({ environment })} />
      <p className={chipVariants({ environment })}>
        <span className="sr-only">Environment: </span>
        {LABELS[environment]}
      </p>
    </div>
  );
}

export { EnvironmentMarker };
