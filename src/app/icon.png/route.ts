import { renderTabIcon, TAB_ICON } from "@/lib/brand/icons";

/**
 * `/icon.png`, the tab icon at 96 px, at an address that stays the same from
 * one deploy to the next. Prerendered by the build.
 */
export function GET(): Response {
  return renderTabIcon(TAB_ICON.side);
}
