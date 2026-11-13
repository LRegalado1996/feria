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

export interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel?: string;
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
  pendingLabel?: string;
  title: string;
}

/** Asks before a destructive action; the action runs only on confirm. */
function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  description,
  isPending = false,
  onCloseAutoFocus,
  onConfirm,
  onOpenChange,
  open,
  pendingLabel = "Deleting…",
  title,
}: ConfirmDialogProps) {
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
            {cancelLabel}
          </Button>
          <Button
            data-testid="confirm-dialog-confirm"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
            variant="destructive"
          >
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog };
