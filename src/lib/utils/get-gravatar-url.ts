import { createHash } from "node:crypto";

export function getGravatarUrl(email: string, size = 80): string {
  const hash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `https://gravatar.com/avatar/${hash}?d=404&s=${size}`;
}
