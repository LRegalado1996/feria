import { Hammer } from "lucide-react";

import { EmptyState } from "@/app/_components/molecules/empty-state";

export interface AdminPlaceholderProps {
  body: string;
  /** A short status shown under the title ("Coming soon"). */
  status: string;
  /** The section's name, the page's one heading. */
  title: string;
}

/** An admin section that is not built yet: its name and what to expect. */
function AdminPlaceholder({ body, status, title }: AdminPlaceholderProps) {
  return (
    <section
      className="space-y-2"
      data-slot="admin-placeholder"
      data-testid="admin-placeholder"
    >
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm font-semibold">{status}</p>
      <EmptyState icon={Hammer} message={body} />
    </section>
  );
}

export { AdminPlaceholder };
