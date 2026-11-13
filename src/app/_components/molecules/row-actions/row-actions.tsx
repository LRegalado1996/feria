"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/app/_components/atoms/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/_components/atoms/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/_components/molecules/dropdown-menu";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";

export interface RowActionsProps {
  /**
   * Called with the menu's trigger, so whatever the action opens (a confirm
   * dialog) can hand focus back to it.
   */
  onDelete: (trigger: HTMLButtonElement | null) => void;
  /**
   * The row's identity, appended to every accessible name ("More actions:
   * Weekend plans"). Without it every row's trigger has the same name, and a
   * screen reader or a name-based locator cannot tell the rows apart.
   */
  rowLabel: string;
  /** Prefix of the trigger's and items' `data-testid`. */
  testId: string;
}

/** An icon-only menu of the actions on one row of a list. */
function RowActions({ onDelete, rowLabel, testId }: RowActionsProps) {
  const { common } = useDictionary();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    // Not modal: the dialog an item opens is, and two modal layers swapping
    // in one tick can leave the page refusing pointer events.
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={interpolate(common.moreActionsForRow, {
                row: rowLabel,
              })}
              data-slot="row-actions"
              data-testid={testId}
              ref={triggerRef}
              size="icon-sm"
              variant="ghost"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{common.moreActions}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          aria-label={interpolate(common.deleteRow, { row: rowLabel })}
          data-testid={`${testId}-delete`}
          onSelect={() => {
            onDelete(triggerRef.current);
          }}
          variant="destructive"
        >
          <Trash2 aria-hidden="true" />
          {common.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { RowActions };
