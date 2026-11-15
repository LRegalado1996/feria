import { getBaseUrl } from "@/lib/orpc/get-base-url";

/**
 * The site's origin for absolute URLs in structured data, the sitemap and
 * share images: the same one the root layout's `metadataBase` resolves
 * canonical URLs against (`BETTER_AUTH_URL`, else the deployment's own).
 */
export function siteOrigin(
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env.BETTER_AUTH_URL;

  return new URL(
    configured === undefined || configured === ""
      ? getBaseUrl(false, env)
      : configured
  ).origin;
}

/** `path` (a site path or an absolute URL) as an absolute URL. */
export function absoluteUrl(path: string, origin = siteOrigin()): string {
  return new URL(path, origin).href;
}
