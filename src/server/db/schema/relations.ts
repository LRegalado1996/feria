import { relations } from "drizzle-orm";

import { account, session, user } from "./auth";
import { post } from "./post";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  posts: many(post),
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
