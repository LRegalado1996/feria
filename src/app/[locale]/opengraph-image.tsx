import { renderLogoImage } from "@/lib/brand/logo-image";
import { SHARE_CARD_SIZE } from "@/lib/seo/share-card";
import { STORE_THEME } from "@/styles/theme";

export { BRAND_NAME as alt } from "@/lib/brand/logo";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

/**
 * The default share card: what WhatsApp, Instagram and the rest show beside
 * a link to any page that does not bring an image of its own. It sits beside
 * the root layout, not above it, for two reasons: that layout's `openGraph`
 * would replace an image declared by a parent segment, and its
 * `metadataBase` is what makes the image's URL absolute. A store page that
 * declares an `openGraph` of its own names it again (`defaultShareImage`).
 */
export default function OpenGraphImage() {
  return renderLogoImage({
    ...size,
    background: STORE_THEME.contrast,
    colorway: "accent",
    logoWidth: 580,
    variant: "full",
  });
}
