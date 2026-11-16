import { Hammer } from "lucide-react";

import { AdminPage } from "@/app/_components/molecules/admin-page";

export interface AdminPlaceholderProps {
  body: string;
  /** A short status shown above the body ("Coming soon"). */
  status: string;
  /** The section's name, the page's one heading. */
  title: string;
}

/**
 * An admin section that is not built yet: its name in the top bar, and a
 * card saying it is coming and what to expect (FER-040).
 */
function AdminPlaceholder({ body, status, title }: AdminPlaceholderProps) {
  return (
    <section data-slot="admin-placeholder" data-testid="admin-placeholder">
      <AdminPage title={title}>
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-16 text-center text-card-foreground">
          <Hammer
            aria-hidden="true"
            className="size-12 text-muted-foreground"
          />
          <p className="text-sm font-semibold">{status}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
        </div>
      </AdminPage>
    </section>
  );
}

export { AdminPlaceholder };
