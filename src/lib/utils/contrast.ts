const HEX_CHANNELS = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  const match = HEX_CHANNELS.exec(hex);

  if (!match) {
    throw new Error(`Not a six-digit hex color: ${hex}`);
  }

  return [
    Number.parseInt(match[1] ?? "", 16),
    Number.parseInt(match[2] ?? "", 16),
    Number.parseInt(match[3] ?? "", 16),
  ];
}

/** One sRGB channel (0 to 255) as linear light, per WCAG 2.x. */
function linearize(channel: number): number {
  const value = channel / 255;

  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([red, green, blue]: Rgb): number {
  return (
    0.2126 * linearize(red) +
    0.7152 * linearize(green) +
    0.0722 * linearize(blue)
  );
}

/**
 * The WCAG 2.x contrast ratio of two six-digit hex colors, from 1 (the same
 * color) to 21 (black on white). The order of the arguments does not matter.
 */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(parseHex(first));
  const b = relativeLuminance(parseHex(second));

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * What CSS `color-mix(in srgb, color <percent>%, base)` computes, as a hex
 * color: each channel is interpolated as written, with no gamma step. It is
 * how the storefront derives its muted colors (`src/styles/globals.css`), so
 * their contrast can be checked before a palette is stored.
 */
export function mixSrgb(color: string, base: string, percent: number): string {
  const from = parseHex(color);
  const to = parseHex(base);
  const weight = percent / 100;

  return `#${from
    .map((channel, index) =>
      Math.round(channel * weight + (to[index] ?? 0) * (1 - weight))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}
