import type { Dictionary } from "@/content/es";

export const common: Dictionary["common"] = {
  cancel: "Cancel",
  carousel: {
    roleDescription: "carousel",
    slide: "{current} of {total}",
    slideRoleDescription: "slide",
  },
  closeDialog: "Close dialog",
  delete: "Delete",
  deleteRow: "Delete: {row}",
  deleting: "Deleting…",
  hidePassword: "Hide password",
  loading: "Loading",
  moreActions: "More actions",
  moreActionsForRow: "More actions: {row}",
  notifications: "Notifications",
  pagination: {
    ellipsis: "More pages",
    label: "Pages",
    next: "Next",
    nextPage: "Next page",
    page: "Page {page}",
    pageOf: "Page {page} of {count}",
    previous: "Previous",
    previousPage: "Previous page",
  },
  numberInput: {
    decimal: "This field takes whole numbers only.",
    unreadable:
      "We couldn't read this number. Type it without a thousands separator, for example 1500 or 12.50.",
  },
  orderStepper: {
    current: "current status",
    done: "done",
    label: "Order status: {status}",
    statuses: {
      delivered: "Delivered",
      packed: "Packed",
      received: "Received",
      undeliverable: "Couldn't deliver",
    },
    upcoming: "to come",
  },
  showPassword: "Show password",
  tryAgain: "Try again",
};
