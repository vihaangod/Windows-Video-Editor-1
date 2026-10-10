export function createSerializedWriteQueue<T>(
  write: (snapshot: T) => Promise<void>,
): (snapshot: T) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();

  return (snapshot) => {
    const operation = tail.then(() => write(snapshot));
    tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}

export async function retryWrite<T>(
  write: () => Promise<T>,
  retryDelaysMs: readonly number[] = [300, 900],
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      lastError = error;
      const delay = retryDelaysMs[attempt];
      if (delay !== undefined) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
