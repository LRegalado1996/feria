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
import { post } from "./post";
import { store, storeTranslation } from "./store";
import { storeMember } from "./store-member";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  posts: many(post),
  storeMemberships: many(storeMember),
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

export const postRelations = relations(post, ({ one }) => ({
  createdBy: one(user, {
    fields: [post.createdById],
    references: [user.id],
  }),
}));

export const storeRelations = relations(store, ({ many }) => ({
  attributes: many(attribute),
  categories: many(category),
  members: many(storeMember),
  products: many(product),
  translations: many(storeTranslation),
}));

export const storeMemberRelations = relations(storeMember, ({ one }) => ({
  store: one(store, {
    fields: [storeMember.storeId],
    references: [store.id],
  }),
  user: one(user, {
    fields: [storeMember.userId],
    references: [user.id],
  }),
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
