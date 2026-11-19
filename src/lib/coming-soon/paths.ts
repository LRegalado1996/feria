import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";

/** Where every storefront address leads while the store is closed (FER-034). */
export const COMING_SOON_PATH = "/coming-soon";

/**
 * The admin's screen for the page and its switch, under the settings: a
 * section of its own would push the phone's menu past a short screen.
 */
const COMING_SOON_ADMIN_PATH = "/admin/settings/coming-soon";

/** {@link COMING_SOON_ADMIN_PATH} in `locale`. */
export function comingSoonAdminPath(locale: Locale): string {
  return localizePath(COMING_SOON_ADMIN_PATH, locale);
}

/**
 * The cookie the proxy sets on the pages it lets a signed-in admin see while
 * the store is closed, and clears everywhere else: it only tells the store's
 * notice to show (`molecules/store-preview-notice`). It grants nothing: the
 * proxy checks the session itself on every request, and a visitor who sets
 * it by hand is still sent to the coming-soon page.
 */
export const STORE_PREVIEW_COOKIE = "lr-store-preview";
