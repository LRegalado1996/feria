import type { Dictionary } from "@/content/es";

export const post: Dictionary["post"] = {
  compose: {
    failed: "Your post was not published. Try again.",
    label: "New post",
    pending: "Posting…",
    placeholder: "What's happening?",
    submit: "Post",
  },
  delete: {
    description:
      "It disappears from the feed for everyone. This cannot be undone.",
    failed: "The post was not deleted. Try again.",
    success: "Post deleted.",
    title: "Delete this post?",
  },
  feed: {
    empty: "No posts yet. Be the first to post!",
    loadFailed: "The feed did not load.",
    loadMoreFailed: "Older posts did not load.",
    loading: "Loading posts",
    title: "Feed",
  },
};
