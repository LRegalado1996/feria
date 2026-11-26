import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/better-auth";

const betterAuth = toNextJsHandler(auth.handler);

/**
 * Sign-up is closed (FER-009): logins are created on the server only. Better
 * Auth already refuses it (`disableSignUp`, and `disabledPaths` answers its
 * exact path), but a 400 still says the route exists and its own match is
 * exact; this answers 404 for any spelling of the prefix, so
 * `/sign-up/email` and any other sign-up method are covered.
 *
 * A login's password and email are changed through the admin's own
 * procedures (FER-015: `admin.changePassword`, which counts wrong current
 * passwords and keeps the change's rules), never through Better Auth's
 * native routes, which know none of that: those are closed the same way.
 */
const CLOSED_PREFIXES = [
  "/api/auth/sign-up",
  "/api/auth/change-password",
  "/api/auth/set-password",
  "/api/auth/change-email",
];

/**
 * The pathname compared loosely: lowercased, repeated slashes collapsed and an
 * encoded dash decoded, so `//sign-up` or `sign%2Dup` cannot slip past. Any
 * other spelling that reaches Better Auth is still refused there
 * (`disableSignUp` and `disabledPaths`): it changes nothing, it only answers
 * an error.
 */
function isClosed(request: Request): boolean {
  const pathname = new URL(request.url).pathname
    .toLowerCase()
    .replaceAll("%2d", "-")
    .replaceAll(/\/{2,}/gu, "/");

  return CLOSED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  return isClosed(request) ? notFound() : await betterAuth.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return isClosed(request) ? notFound() : await betterAuth.POST(request);
}
