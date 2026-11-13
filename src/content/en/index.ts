import type { Dictionary } from "@/content/es";

import { auth } from "./auth";
import { common } from "./common";
import { environment } from "./environment";
import { errors } from "./errors";
import { locale } from "./locale";
import { metadata } from "./metadata";
import { post } from "./post";
import { theme } from "./theme";

/** The English interface text, held to the Spanish dictionary's shape. */
export const en: Dictionary = {
  auth,
  common,
  environment,
  errors,
  locale,
  metadata,
  post,
  theme,
};
