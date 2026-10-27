import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lineName, useNeedLabels } from "../line-name";

const mockIn = jest.fn();
jest.mock("@patina/supabase", () => ({
  createBrowserClient: () => ({
    from: () => ({ select: () => ({ in: mockIn }) }),
  }),
}));

function setup(lines: { selection_thread_id: string | null }[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useNeedLabels("project", lines), { wrapper });
  return { ...hook, client };
}

beforeEach(() => mockIn.mockReset());

test("lineName prefers the need, then a trimmed name, then the unnamed fallback", () => {
  expect(lineName({ name: "Product", selection_thread_id: "t" }, { t: "Need" })).toBe("Need");
  expect(lineName({ name: " Product " })).toBe("Product");
  expect(lineName({ name: " " })).toBe("Unnamed line");
});

test("bounds 501 need-label IDs and merges every chunk without duplicate requests", async () => {
  const ids = Array.from({ length: 501 }, (_, i) => `thread-${String(i).padStart(4, "0")}`);
  mockIn.mockImplementation(async (_column: string, chunk: string[]) => {
    // Model the transport refusal that the native oversized URLs encounter.
    if (chunk.length > 100) return { data: null, error: new Error("URI too long") };
    return { data: chunk.map(id => ({ id, need_label: ` Need ${id} ` })), error: null };
  });
  const lines = [...ids, ids[0], null].map(selection_thread_id => ({ selection_thread_id }));
  const { result, client } = setup(lines);
  await waitFor(() => expect(Object.keys(result.current)).toHaveLength(501));
  expect(mockIn).toHaveBeenCalledTimes(6);
  expect(mockIn.mock.calls.flatMap(([, chunk]) => chunk)).toEqual(ids);
  for (const id of ids) expect(result.current[id]).toBe(`Need ${id}`);
  expect(client.getQueryState(["project-ffe-items", "project", "need-labels", ids.join(",")])?.status).toBe("success");
});

test("a failed label chunk rejects the existing query instead of caching partial labels", async () => {
  const ids = Array.from({ length: 201 }, (_, i) => `t-${i}`);
  const refusal = new Error("thread read refused");
  mockIn.mockImplementation(async (_column: string, chunk: string[]) =>
    chunk.includes("t-99") ? { data: null, error: refusal }
      : { data: chunk.map(id => ({ id, need_label: id })), error: null });
  const { result, client } = setup(ids.map(selection_thread_id => ({ selection_thread_id })));
  const key = ["project-ffe-items", "project", "need-labels", [...ids].sort().join(",")];
  await waitFor(() => expect(client.getQueryState(key)?.status).toBe("error"));
  expect(client.getQueryState(key)?.error).toBe(refusal);
  expect(client.getQueryData(key)).toBeUndefined();
  expect(result.current).toEqual({});
});

test("does not fetch when lines have no selection threads", () => {
  const { result } = setup([{ selection_thread_id: null }]);
  expect(mockIn).not.toHaveBeenCalled();
  expect(result.current).toEqual({});
});

test("omits blank labels and trims nonblank labels", async () => {
  mockIn.mockResolvedValue({ data: [
    { id: "a", need_label: null }, { id: "b", need_label: " " },
    { id: "c", need_label: " Cabinet " },
  ], error: null });
  const { result } = setup(["a", "b", "c"].map(selection_thread_id => ({ selection_thread_id })));
  await waitFor(() => expect(result.current).toEqual({ c: "Cabinet" }));
});
