import { ImageResponse } from "next/og";

import { LOGO_BOX } from "./logo";
import { buildLogoDataUrl, type LogoSvgOptions } from "./logo-svg";

export interface LogoImageOptions extends LogoSvgOptions {
  /** The fill behind the logo; `null` leaves the image transparent. */
  background: string | null;
  height: number;
  /** How wide the logo is drawn; its height follows the drawing's proportions. */
  logoWidth: number;
  width: number;
}

/**
 * A PNG with the logo centered on it, for the generated app icons and the
 * share card. The renderer draws the same SVG document `public/brand/` holds,
 * so a change to the drawing or a brand color reaches every image.
 */
export function renderLogoImage({
  background,
  colorway,
  height,
  logoWidth,
  variant,
  width,
}: LogoImageOptions): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: background ?? "transparent",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      {/* oxlint-disable-next-line next/no-img-element -- drawn by the PNG renderer, not a browser: there is no `next/image` and nothing to optimize */}
      <img
        alt=""
        height={Math.round((logoWidth * LOGO_BOX.height) / LOGO_BOX.width)}
        src={buildLogoDataUrl({ colorway, variant })}
        width={logoWidth}
      />
    </div>,
    { height, width }
  );
}
