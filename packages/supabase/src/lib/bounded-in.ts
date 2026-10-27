/** Keep PostgREST ID filters to 100 values, with at most four reads in flight. */
export async function boundedIn<T>(
  ids: readonly string[],
  read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const results: T[][] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const offset = next;
      next += 100;
      const { data, error } = await read(ids.slice(offset, offset + 100));
      if (error) throw error;
      results[offset / 100] = data ?? [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, Math.ceil(ids.length / 100)) }, worker));
  return results.flat();
}
