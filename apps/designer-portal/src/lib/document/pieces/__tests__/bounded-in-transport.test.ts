import { boundedInTransport } from "../bounded-in-transport";

test("bounds chunks to 100 IDs, merges all results, and shares four workers across reads", async () => {
  const first = Array.from({ length: 501 }, (_, i) => `spec-${i}`);
  const second = Array.from({ length: 301 }, (_, i) => `thread-${i}`);
  const received: string[] = [];
  const chunks: string[][] = [];
  let active = 0;
  let peak = 0;
  const read = async (ids: string[]) => {
    chunks.push(ids);
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    await Promise.resolve();
    received.push(...ids);
    active--;
  };
  await boundedInTransport([{ ids: first, read }, { ids: second, read }]);
  expect(chunks.map(chunk => chunk.length)).toEqual([100, 100, 100, 100, 100, 1, 100, 100, 100, 1]);
  expect(received.sort()).toEqual([...first, ...second].sort());
  expect(peak).toBe(4);
  expect(active).toBe(0);
});

test("propagates a chunk failure rather than resolving a partial success", async () => {
  const refusal = new Error("read refused");
  await expect(boundedInTransport([{
    ids: Array.from({ length: 201 }, (_, i) => String(i)),
    read: async (ids) => { if (ids.includes("100")) throw refusal; },
  }])).rejects.toBe(refusal);
});

test("skips empty reads and supports fewer than four requests", async () => {
  const read = jest.fn().mockResolvedValue(undefined);
  await boundedInTransport([{ ids: [], read }]);
  expect(read).not.toHaveBeenCalled();
  await boundedInTransport([{ ids: ["only"], read }]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(["only"]);
});

it('preserves all 2000 IDs per read with a shared four-worker bound', async () => {
  const ids = Array.from({ length: 2000 }, (_, i) => `line-${i}`);
  const received: string[][] = [[], []];
  let active = 0;
  let peak = 0;
  const sizes: number[] = [];
  await boundedInTransport(received.map((result) => ({
    ids,
    read: async (chunk) => {
      active++;
      peak = Math.max(peak, active);
      sizes.push(chunk.length);
      await Promise.resolve();
      result.push(...chunk);
      active--;
    },
  })));
  expect(peak).toBeLessThanOrEqual(4);
  expect(sizes).toEqual(Array(40).fill(100));
  for (const result of received) expect([...result].sort()).toEqual([...ids].sort());
});
