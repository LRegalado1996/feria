import { renderLogoImage } from "@/lib/brand/logo-image";
import { STORE_PALETTE } from "@/styles/store-palette";

export { BRAND_NAME as alt } from "@/lib/brand/logo";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

/**
 * The default share card: what WhatsApp, Instagram and the rest show beside
 * a link to any page that does not bring an image of its own. It sits beside
 * the root layout, not above it, for two reasons: that layout's `openGraph`
 * would replace an image declared by a parent segment, and its
 * `metadataBase` is what makes the image's URL absolute.
 */
export default function OpenGraphImage() {
  return renderLogoImage({
    ...size,
    background: STORE_PALETTE.foreground,
    colorway: "accent",
    logoWidth: 580,
    variant: "full",
  });
}
