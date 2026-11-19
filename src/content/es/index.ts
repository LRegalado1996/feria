import { admin } from "./admin";
import { articles } from "./articles";
import { auth } from "./auth";
import { comingSoon } from "./coming-soon";
import { common } from "./common";
import { design } from "./design";
import { environment } from "./environment";
import { errors } from "./errors";
import { locale } from "./locale";
import { metadata } from "./metadata";
import { seo } from "./seo";
import { storefront } from "./storefront";
import { theme } from "./theme";

/**
 * The Spanish interface text, one file per area. Spanish is the default
 * language, so it is also the source of the dictionary's shape: every other
 * language is typed against it and fails `pnpm typecheck` on a key that is
 * missing or extra.
 */
export const es = {
  admin,
  articles,
  auth,
  comingSoon,
  common,
  design,
  environment,
  errors,
  locale,
  metadata,
  seo,
  storefront,
  theme,
};

export type Dictionary = typeof es;
