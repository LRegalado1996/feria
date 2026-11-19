import { relations } from "drizzle-orm";

import { account, session, user } from "./auth";
import {
  attribute,
  attributeTranslation,
  attributeValue,
  attributeValueTranslation,
  category,
  categoryTranslation,
  product,
  productImage,
  productAttributeValue,
  productImageTranslation,
  productTranslation,
} from "./catalog";
import {
  announcement,
  announcementTranslation,
  banner,
  bannerTranslation,
  featuredProduct,
  homeSection,
  rankingEntry,
} from "./home";
import { customerOrder, orderItem, orderStatusEvent } from "./order";
import { store, storeTranslation } from "./store";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const storeRelations = relations(store, ({ many }) => ({
  attributes: many(attribute),
  categories: many(category),
  products: many(product),
  translations: many(storeTranslation),
}));

export const storeTranslationRelations = relations(
  storeTranslation,
  ({ one }) => ({
    store: one(store, {
      fields: [storeTranslation.storeId],
      references: [store.id],
    }),
  })
);

export const categoryRelations = relations(category, ({ many, one }) => ({
  // A group and the categories in it (FER-043), one level deep.
  children: many(category, { relationName: "categoryGroup" }),
  parent: one(category, {
    fields: [category.parentId],
    references: [category.id],
    relationName: "categoryGroup",
  }),
  products: many(product),
  store: one(store, { fields: [category.storeId], references: [store.id] }),
  translations: many(categoryTranslation),
}));

export const categoryTranslationRelations = relations(
  categoryTranslation,
  ({ one }) => ({
    category: one(category, {
      fields: [categoryTranslation.categoryId],
      references: [category.id],
    }),
  })
);

export const productRelations = relations(product, ({ many, one }) => ({
  attributeValues: many(productAttributeValue),
  category: one(category, {
    fields: [product.categoryId],
    references: [category.id],
  }),
  images: many(productImage),
  store: one(store, { fields: [product.storeId], references: [store.id] }),
  translations: many(productTranslation),
}));

export const productTranslationRelations = relations(
  productTranslation,
  ({ one }) => ({
    product: one(product, {
      fields: [productTranslation.productId],
      references: [product.id],
    }),
  })
);

export const productImageRelations = relations(
  productImage,
  ({ many, one }) => ({
    product: one(product, {
      fields: [productImage.productId],
      references: [product.id],
    }),
    translations: many(productImageTranslation),
  })
);

export const productImageTranslationRelations = relations(
  productImageTranslation,
  ({ one }) => ({
    image: one(productImage, {
      fields: [productImageTranslation.productImageId],
      references: [productImage.id],
    }),
  })
);

export const attributeRelations = relations(attribute, ({ many, one }) => ({
  store: one(store, { fields: [attribute.storeId], references: [store.id] }),
  translations: many(attributeTranslation),
  values: many(attributeValue),
}));

export const attributeTranslationRelations = relations(
  attributeTranslation,
  ({ one }) => ({
    attribute: one(attribute, {
      fields: [attributeTranslation.attributeId],
      references: [attribute.id],
    }),
  })
);

export const attributeValueRelations = relations(
  attributeValue,
  ({ many, one }) => ({
    attribute: one(attribute, {
      fields: [attributeValue.attributeId],
      references: [attribute.id],
    }),
    products: many(productAttributeValue),
    translations: many(attributeValueTranslation),
  })
);

export const attributeValueTranslationRelations = relations(
  attributeValueTranslation,
  ({ one }) => ({
    value: one(attributeValue, {
      fields: [attributeValueTranslation.attributeValueId],
      references: [attributeValue.id],
    }),
  })
);

export const productAttributeValueRelations = relations(
  productAttributeValue,
  ({ one }) => ({
    product: one(product, {
      fields: [productAttributeValue.productId],
      references: [product.id],
    }),
    value: one(attributeValue, {
      fields: [productAttributeValue.attributeValueId],
      references: [attributeValue.id],
    }),
  })
);

export const customerOrderRelations = relations(
  customerOrder,
  ({ many, one }) => ({
    items: many(orderItem),
    statusEvents: many(orderStatusEvent),
    store: one(store, {
      fields: [customerOrder.storeId],
      references: [store.id],
    }),
  })
);

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(customerOrder, {
    fields: [orderItem.orderId],
    references: [customerOrder.id],
  }),
}));

export const orderStatusEventRelations = relations(
  orderStatusEvent,
  ({ one }) => ({
    changedBy: one(user, {
      fields: [orderStatusEvent.changedById],
      references: [user.id],
    }),
    order: one(customerOrder, {
      fields: [orderStatusEvent.orderId],
      references: [customerOrder.id],
    }),
  })
);

export const announcementRelations = relations(
  announcement,
  ({ many, one }) => ({
    store: one(store, {
      fields: [announcement.storeId],
      references: [store.id],
    }),
    translations: many(announcementTranslation),
  })
);

export const announcementTranslationRelations = relations(
  announcementTranslation,
  ({ one }) => ({
    announcement: one(announcement, {
      fields: [announcementTranslation.announcementId],
      references: [announcement.id],
    }),
  })
);

export const bannerRelations = relations(banner, ({ many, one }) => ({
  linkCategory: one(category, {
    fields: [banner.linkCategoryId],
    references: [category.id],
  }),
  linkProduct: one(product, {
    fields: [banner.linkProductId],
    references: [product.id],
  }),
  store: one(store, { fields: [banner.storeId], references: [store.id] }),
  translations: many(bannerTranslation),
}));

export const bannerTranslationRelations = relations(
  bannerTranslation,
  ({ one }) => ({
    banner: one(banner, {
      fields: [bannerTranslation.bannerId],
      references: [banner.id],
    }),
  })
);

export const homeSectionRelations = relations(homeSection, ({ one }) => ({
  banner: one(banner, {
    fields: [homeSection.bannerId],
    references: [banner.id],
  }),
  category: one(category, {
    fields: [homeSection.categoryId],
    references: [category.id],
  }),
}));

export const rankingEntryRelations = relations(rankingEntry, ({ one }) => ({
  product: one(product, {
    fields: [rankingEntry.productId],
    references: [product.id],
  }),
}));

export const featuredProductRelations = relations(
  featuredProduct,
  ({ one }) => ({
    product: one(product, {
      fields: [featuredProduct.productId],
      references: [product.id],
    }),
  })
);
