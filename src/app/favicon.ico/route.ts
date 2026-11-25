import { renderFavicon } from "@/lib/brand/icons";

/**
 * `/favicon.ico`, the address crawlers and tools try before reading a page:
 * the tab icon at 48 px. Without this route the proxy would send the request
 * to the storefront, which answers a page where an image is expected. It
 * reads nothing per request, so the build prerenders it.
 */
export async function GET(): Promise<Response> {
  return await renderFavicon();
}
