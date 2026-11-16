import { renderLogoImage } from "@/lib/brand/logo-image";
import { STORE_THEME } from "@/styles/theme";

export const size = { height: 180, width: 180 };
export const contentType = "image/png";

/**
 * The home-screen icon. It is opaque (a phone fills transparency with a color
 * of its own) and keeps a margin, because the phone rounds its corners.
 */
export default function AppleIcon() {
  return renderLogoImage({
    ...size,
    background: STORE_THEME.foreground,
    colorway: "accent",
    logoWidth: 132,
    variant: "mark",
  });
}
