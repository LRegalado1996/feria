import { renderLogoImage } from "@/lib/brand/logo-image";

export const size = { height: 32, width: 32 };
export const contentType = "image/png";

/**
 * The browser tab icon: the mark alone (the name cannot be read this small),
 * on nothing, so it sits on a light tab strip and a dark one alike.
 */
export default function Icon() {
  return renderLogoImage({
    ...size,
    background: null,
    colorway: "accent",
    logoWidth: size.width,
    variant: "mark",
  });
}
