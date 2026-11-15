import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/better-auth";

const betterAuth = toNextJsHandler(auth.handler);

/**
 * Sign-up is closed (FER-009): logins are created on the server only. Better
 * Auth already refuses it with `disableSignUp`, but a 400 still says the
 * route exists; this answers as if it never did. Compared on the pathname's
 * prefix, so `/sign-up/email` and any other sign-up method are covered.
 */
const CLOSED_PREFIXES = ["/api/auth/sign-up"];

function isClosed(request: Request): boolean {
  const { pathname } = new URL(request.url);

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
