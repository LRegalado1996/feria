import { describe, expect, test } from "vitest";

import { wrapPngInIco } from "./ico";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function setup(side = 48) {
  const file = wrapPngInIco(PNG, side);

  return { file, view: new DataView(file.buffer) };
}

describe("wrapPngInIco", () => {
  test("starts with an icon header that holds one image", () => {
    const { view } = setup();

    expect([
      view.getUint16(0, true),
      view.getUint16(2, true),
      view.getUint16(4, true),
    ]).toEqual([0, 1, 1]);
  });

  test("describes the image as a square of its side, one plane, 32 bits per pixel, no palette", () => {
    const { view } = setup(48);

    expect({
      bits: view.getUint16(12, true),
      colors: view.getUint8(8),
      height: view.getUint8(7),
      planes: view.getUint16(10, true),
      width: view.getUint8(6),
    }).toEqual({ bits: 32, colors: 0, height: 48, planes: 1, width: 48 });
  });

  test("points at the PNG, carried unchanged after the 22 bytes of header", () => {
    const { file, view } = setup();

    expect(view.getUint32(14, true)).toBe(PNG.length);
    expect(view.getUint32(18, true)).toBe(22);
    expect(file).toHaveLength(22 + PNG.length);
    expect(file.subarray(22)).toEqual(PNG);
  });

  test.each([
    [1, 1],
    [255, 255],
    // The one size a byte cannot hold is written as 0.
    [256, 0],
  ])("writes a %i px side as %i", (side, byte) => {
    const { view } = setup(side);

    expect([view.getUint8(6), view.getUint8(7)]).toEqual([byte, byte]);
  });

  test.each([0, 257, 47.5, -48])("refuses a %d px side", (side) => {
    expect(() => wrapPngInIco(PNG, side)).toThrow(
      `An ICO image is 1 to 256 px a side, not ${side}`
    );
  });
});
