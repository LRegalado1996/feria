/**
 * Writes the logo files in `public/brand/` from the drawing in
 * `src/lib/brand/`. Run it (`pnpm brand:assets`) after changing the drawing or
 * a brand color; a unit test fails while the files and the code disagree.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BRAND_LOGO_FILES, buildLogoSvg } from "../src/lib/brand/logo-svg";

const directory = path.join(import.meta.dirname, "..", "public", "brand");

mkdirSync(directory, { recursive: true });

for (const [name, options] of Object.entries(BRAND_LOGO_FILES)) {
  writeFileSync(path.join(directory, name), buildLogoSvg(options));
}
