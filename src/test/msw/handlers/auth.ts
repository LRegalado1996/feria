import { HttpResponse, http } from "msw";

const authUser = {
  id: "1",
  email: "test@example.com",
  name: "Test User",
  emailVerified: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  image: null,
};

export const authHandlers = [
  // Signed out by default: Better Auth's client probes the session from deep
  // inside component trees, and with every request answered or failed, an
  // unanswered probe would fail the test. A test that needs a session
  // overrides this with `server.use(...)`.
  http.get("*/api/auth/get-session", () => HttpResponse.json(null)),
  http.post("*/api/auth/sign-in/email", () =>
    HttpResponse.json({
      token: "mock-session-token",
      user: authUser,
      redirect: false,
      url: null,
    })
  ),
  http.post("*/api/auth/sign-up/email", () =>
    HttpResponse.json({
      token: "mock-session-token",
      user: authUser,
    })
  ),
];
