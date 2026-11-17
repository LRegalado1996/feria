"use client";

import type { ComponentProps } from "react";

import { Button } from "@/app/_components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/_components/molecules/dialog";
import { useDictionary } from "@/lib/hooks/i18n";

export interface ConfirmDialogProps {
  /** Defaults to the dictionary's "Cancel". */
  cancelLabel?: string;
  /** Defaults to the dictionary's "Delete". */
  confirmLabel?: string;
  /**
   * The confirm button's look: `destructive` (the default) for what loses
   * something, `default` for a change that is easily undone (an order's
   * status moved forward, FER-051).
   */
  confirmVariant?: "default" | "destructive";
  description: string;
  /** The action is running: the confirm button says so and stays disabled. */
  isPending?: boolean;
  /**
   * Where focus goes when the dialog closes. A controlled dialog has no
   * trigger of its own to return to (design.md § Focus after close).
   */
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Defaults to the dictionary's "Deleting…". */
  pendingLabel?: string;
  title: string;
}

/** Asks before an action; the action runs only on confirm. */
function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  confirmVariant = "destructive",
  description,
  isPending = false,
  onCloseAutoFocus,
  onConfirm,
  onOpenChange,
  open,
  pendingLabel,
  title,
}: ConfirmDialogProps) {
  const { common } = useDictionary();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        data-testid="confirm-dialog"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            type="button"
            variant="outline"
          >
            {cancelLabel ?? common.cancel}
          </Button>
          <Button
            data-testid="confirm-dialog-confirm"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
            variant={confirmVariant}
          >
            {isPending
              ? (pendingLabel ?? common.deleting)
              : (confirmLabel ?? common.delete)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog };
