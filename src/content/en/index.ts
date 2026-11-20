import type { Dictionary } from "@/content/es";

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

/** The English interface text, held to the Spanish dictionary's shape. */
export const en: Dictionary = {
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
