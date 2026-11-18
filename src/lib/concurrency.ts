// Runs `worker` over `items` with at most `limit` calls in flight, keeping
// results in input order. Used for per-student/per-chunk fan-outs that would
// otherwise fire hundreds of requests at once.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () =>
      runNext(),
    ),
  );
  return results;
}

// Like Promise.allSettled over a worker, with at most `limit` in flight.
export function settleWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  return mapWithConcurrency(items, limit, (item, index) =>
    worker(item, index).then(
      (value): PromiseSettledResult<R> => ({ status: "fulfilled", value }),
      (reason: unknown): PromiseSettledResult<R> => ({
        status: "rejected",
        reason,
      }),
    ),
  );
}
