import type { Dictionary } from "@/content/es";

export const auth: Dictionary["auth"] = {
  errors: {
    invalidCredentials: "Invalid email or password.",
    unreachable:
      "We could not reach the server. Check your connection and try again.",
    userExists: "An account with this email already exists.",
  },
  fields: {
    email: { label: "Email", placeholder: "you@example.com" },
    name: { label: "Name", placeholder: "Your name" },
    password: { label: "Password" },
  },
  signIn: {
    failed: "Sign in failed. Try again.",
    pending: "Signing in…",
    submit: "Sign In",
    switchTo: "Don't have an account? Sign Up",
  },
  signOut: {
    failed: "You are still signed in. Try again.",
    pending: "Signing out…",
    submit: "Sign out",
  },
  signUp: {
    failed: "Sign up failed. Try again.",
    pending: "Signing up…",
    submit: "Sign Up",
    switchTo: "Already have an account? Sign In",
  },
  validation: {
    emailInvalid: "Please enter a valid email",
    nameTooShort: "Name must be at least 2 characters",
    passwordTooShort: "Password must be at least 8 characters",
  },
  welcome: {
    subtitle: "Sign in to your account to continue",
    title: "Welcome back",
  },
};
