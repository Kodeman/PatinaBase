import { beforeEach, describe, expect, it, vi } from "vitest";

type BuilderResult = { data: unknown; error: unknown };

function makeBuilder(result: BuilderResult) {
  const chain: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = { __chain: chain };
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      chain.push({ method, args });
      return builder;
    });

  builder.update = record("update");
  builder.eq = record("eq");
  builder.select = record("select");
  builder.maybeSingle = vi.fn(() => {
    chain.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(result);
  });

  return builder as {
    __chain: Array<{ method: string; args: unknown[] }>;
  };
}

let builder = makeBuilder({ data: null, error: null });
const fromSpy = vi.fn(() => builder);

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ from: fromSpy }),
}));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useUpdateProjectFfeSpec } from "../use-spec-books";

beforeEach(() => {
  builder = makeBuilder({
    data: { id: "spec-1", finish: "Aged oak", row_version: 8 },
    error: null,
  });
  fromSpy.mockClear();
  invalidateQueries.mockReset();
});

describe("useUpdateProjectFfeSpec", () => {
  it("uses row_version only as the concurrency predicate", async () => {
    const mutation = useUpdateProjectFfeSpec() as unknown as {
      retry: boolean;
      mutationFn: (input: {
        projectId: string;
        specId: string;
        expectedRowVersion: number;
        changes: { finish: string };
      }) => Promise<{ row_version: number }>;
    };

    const updated = await mutation.mutationFn({
      projectId: "project-1",
      specId: "spec-1",
      expectedRowVersion: 7,
      changes: { finish: "Aged oak" },
    });

    expect(mutation.retry).toBe(false);
    expect(fromSpy).toHaveBeenCalledWith("project_ffe_specs");
    expect(builder.__chain).toEqual([
      { method: "update", args: [{ finish: "Aged oak" }] },
      { method: "eq", args: ["id", "spec-1"] },
      { method: "eq", args: ["row_version", 7] },
      { method: "select", args: ["*"] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(updated.row_version).toBe(8);
  });

  it("surfaces a stale write without retrying it", async () => {
    builder = makeBuilder({ data: null, error: null });
    const mutation = useUpdateProjectFfeSpec() as unknown as {
      retry: boolean;
      mutationFn: (input: {
        projectId: string;
        specId: string;
        expectedRowVersion: number;
        changes: { finish: string };
      }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({
        projectId: "project-1",
        specId: "spec-1",
        expectedRowVersion: 7,
        changes: { finish: "Smoked oak" },
      }),
    ).rejects.toThrow(
      "This selection changed in another session. Refresh before saving.",
    );
    expect(mutation.retry).toBe(false);
  });
});
