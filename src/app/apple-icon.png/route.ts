import { renderHomeScreenIcon } from "@/lib/brand/icons";

/**
 * `/apple-icon.png`, the home-screen icon at 180 px, at an address that stays
 * the same from one deploy to the next. Prerendered by the build.
 */
export function GET(): Response {
  return renderHomeScreenIcon();
}
