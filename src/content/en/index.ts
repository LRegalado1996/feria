import type { Dictionary } from "@/content/es";

import { auth } from "./auth";
import { common } from "./common";
import { design } from "./design";
import { environment } from "./environment";
import { errors } from "./errors";
import { locale } from "./locale";
import { metadata } from "./metadata";
import { post } from "./post";
import { storefront } from "./storefront";
import { theme } from "./theme";

/** The English interface text, held to the Spanish dictionary's shape. */
export const en: Dictionary = {
  auth,
  common,
  design,
  environment,
  errors,
  locale,
  metadata,
  post,
  storefront,
  theme,
};
