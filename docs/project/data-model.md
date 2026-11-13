# Data model

First draft. Each table is finalized in the ticket that creates it. Template rules apply: no JSON columns, 3NF, singular snake_case tables, camelCase columns, integer identity ids, timestamps with time zone, every foreign key states `onDelete` and has an index, and a row reached from an unauthenticated URL carries a random `token`.

`locale` is an enum: `es`, `en`. Every table has `createdAt` and `updatedAt` unless noted.

## Stores and access

| Table                | Columns                                                                                                                                                                                           | Notes                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `user` (Better Auth) | + `role` (`superadmin`, `member`)                                                                                                                                                                 | Text id, as Better Auth creates it.                                                                                         |
| `store`              | `slug` unique, `name`, `whatsappNumber`, `instagramUrl`, `tiktokUrl`, `currencyCode`, `logoUrl`, `isActive`, `colorBackground`, `colorSurface`, `colorForeground`, `colorContrast`, `colorAccent` | `currencyCode` is an enum: `UYU`, `USD`. Theme colors are plain columns, validated as hex and checked for contrast on save. |
| `store_translation`  | `storeId`, `locale`, `tagline`, `description`                                                                                                                                                     | Unique on (`storeId`, `locale`).                                                                                            |
| `store_member`       | `storeId`, `userId`                                                                                                                                                                               | Unique pair. Superadmins need no row.                                                                                       |

## Catalog

| Table                       | Columns                                                                                                                 | Notes                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `category`                  | `storeId`, `slug`, `position`                                                                                           | Slug unique per store.                                                          |
| `category_translation`      | `categoryId`, `locale`, `name`                                                                                          |                                                                                 |
| `product`                   | `storeId`, `categoryId`, `slug`, `priceAmount` (integer), `status` (`draft`, `published`), `isAvailable`, `publishedAt` | Slug unique per store. `priceAmount` is in minor units of the store's currency. |
| `product_translation`       | `productId`, `locale`, `title`, `description`, `seoTitle`, `seoDescription`                                             |                                                                                 |
| `product_image`             | `productId`, `url`, `width`, `height`, `position`                                                                       | First by position is the cover.                                                 |
| `product_image_translation` | `productImageId`, `locale`, `altText`                                                                                   |                                                                                 |

## Filters

A store's own way of tagging articles, such as Color or Material. See [FER-033](../tickets/FER-033-article-filters.md).

| Table                         | Columns                                                     | Notes                                                             |
| ----------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `attribute`                   | `storeId`, `slug`, `position`                               | Slug unique per store; it is the URL parameter name.              |
| `attribute_translation`       | `attributeId`, `locale`, `name`                             |                                                                   |
| `attribute_value`             | `attributeId`, `slug`, `swatchColor` (nullable), `position` | Slug unique per attribute.                                        |
| `attribute_value_translation` | `attributeValueId`, `locale`, `name`                        |                                                                   |
| `product_attribute_value`     | `productId`, `attributeValueId`                             | Unique pair. An article can hold several values of one attribute. |

## Home curation

| Table                | Columns                                                                        | Notes                                                                                       |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `banner`             | `storeId`, `imageUrl`, `linkUrl`, `position`, `isActive`, `startsAt`, `endsAt` | The fair banners expire on their own.                                                       |
| `banner_translation` | `bannerId`, `locale`, `title`, `subtitle`, `ctaLabel`                          |                                                                                             |
| `ranking_entry`      | `storeId`, `productId`, `position`                                             | The curated "best sellers". Unique on (`storeId`, `position`) and (`storeId`, `productId`). |
| `featured_product`   | `storeId`, `productId`, `position`                                             | The highlighted articles.                                                                   |

## Orders

| Table                | Columns                                                                                                                                                                                        | Notes                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer_order`     | `storeId`, `token`, `code`, `customerName`, `customerPhone`, `phoneVerifiedAt`, `status` (`received`, `packed`, `delivered`, `undeliverable`), `note`, `totalAmount`, `currencyCode`, `locale` | `order` is a reserved word. The currency is copied from the store at purchase time. `token` is the public URL key, `code` the short one read aloud at the stall. |
| `order_item`         | `orderId`, `productId` (set null), `title`, `unitPriceAmount`, `quantity`                                                                                                                      | Title and price are copied at purchase time.                                                                                                                     |
| `order_status_event` | `orderId`, `status`, `changedById`, `createdAt`                                                                                                                                                | History, append only.                                                                                                                                            |
| `phone_verification` | `orderId`, `codeHash`, `expiresAt`, `attemptCount`, `consumedAt`                                                                                                                               | Only written when verification is enabled.                                                                                                                       |

## Metrics

| Table                | Columns                                                                                                                                                            | Notes                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `product_view_daily` | `productId`, `storeId`, `day`, `viewCount`                                                                                                                         | One row per product per business day, incremented by upsert. |
| `store_visit_daily`  | `storeId`, `day`, `visitCount`                                                                                                                                     |                                                              |
| `ai_generation`      | `storeId`, `userId`, `productId` (set null), `model`, `inputTokens`, `outputTokens`, `costMicroUsd`, `durationMs`, `outcome` (`succeeded`, `failed`), `wasApplied` | One row per Claude call.                                     |

The cart is not stored: it lives in the browser, per store, until checkout creates the order.
