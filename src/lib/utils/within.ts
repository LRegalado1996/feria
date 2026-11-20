/**
 * `promise`, or a rejection naming `what` once `ms` have passed without it
 * settling. The timer is cleared either way, so a fast answer leaves nothing
 * running. The promise itself is not cancelled: its caller stops waiting.
 */
export async function within<T>(
  promise: Promise<T>,
  ms: number,
  what: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} took over ${ms} ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
