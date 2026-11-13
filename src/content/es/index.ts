import { auth } from "./auth";
import { common } from "./common";
import { environment } from "./environment";
import { errors } from "./errors";
import { locale } from "./locale";
import { metadata } from "./metadata";
import { post } from "./post";
import { theme } from "./theme";

/**
 * The Spanish interface text, one file per area. Spanish is the default
 * language, so it is also the source of the dictionary's shape: every other
 * language is typed against it and fails `pnpm typecheck` on a key that is
 * missing or extra.
 */
export const es = {
  auth,
  common,
  environment,
  errors,
  locale,
  metadata,
  post,
  theme,
};

export type Dictionary = typeof es;
