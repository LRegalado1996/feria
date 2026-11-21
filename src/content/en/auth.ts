import type { Dictionary } from "@/content/es";

export const auth: Dictionary["auth"] = {
  errors: {
    invalidCredentials: "Invalid email or password.",
    unreachable:
      "We could not reach the server. Check your connection and try again.",
  },
  fields: {
    email: { label: "Email", placeholder: "you@example.com" },
    password: { label: "Password" },
  },
  signIn: {
    failed: "Sign in failed. Try again.",
    pending: "Signing in…",
    submit: "Sign In",
  },
  signOut: {
    failed: "You are still signed in. Try again.",
    pending: "Signing out…",
    submit: "Sign out",
  },
  validation: {
    emailInvalid: "Please enter a valid email",
    passwordTooShort: "Password must be at least 8 characters",
  },
};
