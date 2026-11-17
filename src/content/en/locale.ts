import type { Dictionary } from "@/content/es";

export const locale: Dictionary["locale"] = {
  // The toggle names the language it leads to, in that language, so a visitor
  // who cannot read the current one still recognises their own.
  switchTo: "Español",
  // Read after the name, in the page's language: which one is on now.
  current: "Current language: English",
};
