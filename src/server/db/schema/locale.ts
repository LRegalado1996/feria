import { pgEnum } from "drizzle-orm/pg-core";

import { LOCALES } from "@/lib/i18n/config";

/**
 * The language of a `*_translation` row: the product's own languages, as they
 * appear in the URL. A new language is a new value here and in `LOCALES`
 * (docs/agents/database.md § Migrations has the rule for adding one).
 */
export const localeEnum = pgEnum("locale", LOCALES);
