import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { loginsKey, useLogins } from "./use-logins";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const ROWS = [
  {
    createdAt: "2026-11-01T12:00:00.000Z",
    disabledAt: null,
    email: "ana@example.com",
    id: "login-1",
    mustChangePassword: false,
    name: "Ana",
  },
  {
    createdAt: "2026-11-02T12:00:00.000Z",
    disabledAt: "2026-11-20T12:00:00.000Z",
    email: "beto@example.com",
    id: "login-2",
    mustChangePassword: true,
    name: "Beto",
  },
];

function setup({ fails = false }: { fails?: boolean } = {}) {
  const list = vi.fn((_input: unknown) => ROWS);
  server.use(
    fails
      ? createOrpcErrorHandler("user.list", {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          status: 401,
        })
      : createOrpcHandler("user.list", list)
  );
  const wrapper = createQueryWrapper();
  const { result } = renderHook(() => useLogins(), { wrapper });

  return { list, queryClient: wrapper.queryClient, result };
}

describe("useLogins", () => {
  test("reads the store's logins, cached under the list key", async () => {
    const { list, queryClient, result } = setup();

    await waitFor(() => {
      expect(result.current.data).toEqual(ROWS);
    });
    expect(list).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(queryClient.getQueryData(loginsKey())).toEqual(ROWS);
  });

  test("a refused read is an error, never an empty list", async () => {
    const { result } = setup({ fails: true });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(result.current.data).toBeUndefined();
  });
});
