import { relations } from "drizzle-orm";

import { account, session, user } from "./auth";
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
  members: many(storeMember),
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
