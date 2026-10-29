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
const rpcSpy = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ from: fromSpy, rpc: rpcSpy }),
}));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  ProjectFfeSpecConflictError,
  usePrepareSpecBookIssue,
  useUpdateProjectFfeSpec,
} from "../use-spec-books";

beforeEach(() => {
  builder = makeBuilder({
    data: { id: "spec-1", finish: "Aged oak", row_version: 8 },
    error: null,
  });
  fromSpy.mockClear();
  rpcSpy.mockReset().mockResolvedValue({ data: { revision: {}, artifacts: [] }, error: null });
  invalidateQueries.mockReset();
});

describe("useUpdateProjectFfeSpec", () => {
  it("rejects attempts to write the compatibility readiness cache", async () => {
    const mutation = useUpdateProjectFfeSpec() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(mutation.mutationFn({
      projectId: "project-1",
      specId: "spec-1",
      expectedRowVersion: 7,
      changes: { readiness_status: "ready" },
    })).rejects.toThrow(/Readiness is derived/);
    expect(fromSpy).not.toHaveBeenCalled();
  });

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

  it("answers a stale row_version with the row the other session left, refetching only the line reads", async () => {
    const mutation = useUpdateProjectFfeSpec() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
      onError: (error: unknown, input: { projectId: string }) => void;
    };
    const peer = { id: "spec-1", finish: "Peer walnut", row_version: 9 };
    (builder as unknown as { maybeSingle: ReturnType<typeof vi.fn> }).maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: peer, error: null });

    const refused = await mutation.mutationFn({
      projectId: "project-1",
      specId: "spec-1",
      expectedRowVersion: 7,
      changes: { finish: "Mine" },
    }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ProjectFfeSpecConflictError);
    expect((refused as ProjectFfeSpecConflictError).current).toEqual(peer);
    // The update, then a plain read of the same row.
    expect(builder.__chain).toEqual([
      { method: "update", args: [{ finish: "Mine" }] },
      { method: "eq", args: ["id", "spec-1"] },
      { method: "eq", args: ["row_version", 7] },
      { method: "select", args: ["*"] },
      { method: "select", args: ["*"] },
      { method: "eq", args: ["id", "spec-1"] },
    ]);

    mutation.onError(refused, { projectId: "project-1" });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["project-ffe-items", "project-1"] });
    mutation.onError(new Error("other"), { projectId: "project-1" });
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("forwards canonical warning ids in the issue RPC payload", async () => {
    const mutation = usePrepareSpecBookIssue() as unknown as {
      mutationFn: (input: {
        specBookId: string;
        audiences: string[];
        issueType: string;
        reason: string | null;
        baseRevisionId: string | null;
        idempotencyKey: string;
        warningAcknowledgements: Array<{ id: string; reason: string }>;
      }) => Promise<unknown>;
    };
    const acknowledgements = [
      { id: "missing-client-note:item-1", reason: "Reviewed" },
      { id: "stale-source:item-1", reason: "Reviewed" },
    ];

    await mutation.mutationFn({
      specBookId: "book-1",
      audiences: ["client"],
      issueType: "full",
      reason: null,
      baseRevisionId: null,
      idempotencyKey: "issue-key",
      warningAcknowledgements: acknowledgements,
    });

    expect(rpcSpy).toHaveBeenCalledWith("prepare_spec_book_issue", {
      p_spec_book_id: "book-1",
      p_audiences: ["client"],
      p_issue_type: "full",
      p_reason: null,
      p_base_revision_id: null,
      p_idempotency_key: "issue-key",
      p_warning_acknowledgements: acknowledgements,
    });
  });
});
