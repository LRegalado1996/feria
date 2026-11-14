import type { Dictionary } from "@/content/es";

export const errors: Dictionary["errors"] = {
  global: {
    description: "The app failed to load. Try again in a moment.",
    retry: "Try again",
    title: "Something went wrong",
  },
  notFound: {
    description:
      "The address you opened does not exist or is no longer available.",
    homeLink: "Go to the home page",
    title: "Page not found",
  },
  page: {
    description: "This page failed to load. Try again in a moment.",
    supportCode: "Support code:",
    title: "Something went wrong",
  },
};
