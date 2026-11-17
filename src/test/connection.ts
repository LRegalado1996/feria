import type { connection } from "next/server";
import type { Mock } from "vitest";

/**
 * The request has not arrived yet: the next call to the mocked `connection()`
 * stays pending until `arrive()` lets it through. Call order alone stays
 * green when the code drops the `await`; a read that waits for the request
 * cannot happen before `arrive()`, and one that does not happens at once.
 *
 *   const request = holdRequest(connection);
 *   const content = StoreHomeContent({ locale: "es" });
 *   await settle();
 *   expect(readStore).not.toHaveBeenCalled();
 *   request.arrive();
 *   render(await content);
 */
export function holdRequest(connectionMock: Mock<typeof connection>) {
  let arrive: () => void = () => undefined;
  const arrived = new Promise<undefined>((resolve) => {
    arrive = () => {
      resolve(undefined);
    };
  });
  connectionMock.mockImplementationOnce(async () => {
    await arrived;
  });

  return { arrive };
}

/** Lets every callback already queued run: a timer fires after them all. */
export async function settle() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
