import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — same rig as use-project-notes.test.ts / use-decisions.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  maybeSingle: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  __chain: Array<{ method: string; args: unknown[] }>;
  __result: BuilderResult;
}

function makeBuilder(
  initial: BuilderResult = { data: null, error: null },
): MockBuilder {
  const builder = {
    __chain: [] as Array<{ method: string; args: unknown[] }>,
    __result: initial,
  } as MockBuilder;

  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      builder.__chain.push({ method, args });
      return builder;
    });

  builder.select = record("select");
  builder.eq = record("eq");

  builder.maybeSingle = vi.fn(() => {
    builder.__chain.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(builder.__result);
  });

  return builder;
}

const builders: Record<string, MockBuilder> = {};

function setTableResult(table: string, result: BuilderResult): MockBuilder {
  const b = makeBuilder(result);
  builders[table] = b;
  return b;
}

function callsTo(builder: MockBuilder, method: string) {
  return builder.__chain.filter((c) => c.method === method);
}

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
const setQueryData = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, setQueryData }),
}));

import {
  readingMarkKeys,
  useReadingMark,
  useMarkProjectRead,
  usePreviousReadingMark,
} from "../use-reading-marks";

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(builders)) delete builders[key];
});

describe("readingMarkKeys", () => {
  it("shapes the current and previous keys", () => {
    expect(readingMarkKeys.current("proj-1")).toEqual([
      "project-reading-mark",
      "proj-1",
    ]);
    expect(readingMarkKeys.previous("proj-1")).toEqual([
      "project-reading-mark",
      "previous",
      "proj-1",
    ]);
  });
});

interface QueryConfig {
  queryKey: unknown[];
  queryFn: () => Promise<string | null>;
  enabled: boolean;
}

describe("useReadingMark", () => {
  it("uses the current-mark query key and is disabled without a projectId", () => {
    const config = useReadingMark(undefined) as unknown as QueryConfig;
    expect(config.enabled).toBe(false);

    const configWithId = useReadingMark("proj-1") as unknown as QueryConfig;
    expect(configWithId.queryKey).toEqual(["project-reading-mark", "proj-1"]);
    expect(configWithId.enabled).toBe(true);
  });

  it("selects read_at by project_id via maybeSingle", async () => {
    setTableResult("project_reading_marks", {
      data: { read_at: "2026-09-03T00:00:00.000Z" },
      error: null,
    });

    const config = useReadingMark("proj-1") as unknown as QueryConfig;
    const result = await config.queryFn();

    const builder = builders.project_reading_marks;
    expect(callsTo(builder, "select")[0].args).toEqual(["read_at"]);
    expect(callsTo(builder, "eq")[0].args).toEqual(["project_id", "proj-1"]);
    expect(callsTo(builder, "maybeSingle")).toHaveLength(1);
    expect(result).toBe("2026-09-03T00:00:00.000Z");
  });

  it("returns null when there is no reading mark yet", async () => {
    setTableResult("project_reading_marks", { data: null, error: null });
    const config = useReadingMark("proj-1") as unknown as QueryConfig;
    expect(await config.queryFn()).toBeNull();
  });

  it("throws on a query error", async () => {
    setTableResult("project_reading_marks", {
      data: null,
      error: new Error("boom"),
    });
    const config = useReadingMark("proj-1") as unknown as QueryConfig;
    await expect(config.queryFn()).rejects.toThrow("boom");
  });
});

describe("useMarkProjectRead", () => {
  it("calls the RPC with p_project_id and returns the previous timestamp", async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: "2026-09-01T00:00:00.000Z",
      error: null,
    });

    const config = useMarkProjectRead() as unknown as {
      mutationFn: (input: { projectId: string }) => Promise<string | null>;
    };
    const previous = await config.mutationFn({ projectId: "proj-1" });

    expect(supabaseClient.rpc).toHaveBeenCalledWith("mark_project_read", {
      p_project_id: "proj-1",
    });
    expect(previous).toBe("2026-09-01T00:00:00.000Z");
  });

  it("returns null on the first ever mark", async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: null });
    const config = useMarkProjectRead() as unknown as {
      mutationFn: (input: { projectId: string }) => Promise<string | null>;
    };
    expect(await config.mutationFn({ projectId: "proj-1" })).toBeNull();
  });

  it("throws on an RPC error", async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: new Error("boom"),
    });
    const config = useMarkProjectRead() as unknown as {
      mutationFn: (input: { projectId: string }) => Promise<string | null>;
    };
    await expect(config.mutationFn({ projectId: "proj-1" })).rejects.toThrow(
      "boom",
    );
  });

  it("caches the previous timestamp under the previous key and invalidates only the current key", () => {
    const config = useMarkProjectRead() as unknown as {
      onSuccess: (
        previous: string | null,
        variables: { projectId: string },
      ) => void;
    };
    config.onSuccess("2026-09-01T00:00:00.000Z", { projectId: "proj-1" });

    expect(setQueryData).toHaveBeenCalledWith(
      ["project-reading-mark", "previous", "proj-1"],
      "2026-09-01T00:00:00.000Z",
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["project-reading-mark", "proj-1"],
    });
  });

  it("caches null when the RPC returns no previous mark", () => {
    const config = useMarkProjectRead() as unknown as {
      onSuccess: (
        previous: string | null,
        variables: { projectId: string },
      ) => void;
    };
    config.onSuccess(null, { projectId: "proj-1" });

    expect(setQueryData).toHaveBeenCalledWith(
      ["project-reading-mark", "previous", "proj-1"],
      null,
    );
  });
});

describe("usePreviousReadingMark", () => {
  it("reads the previous key cache-only — disabled, no staleness, no fetcher", () => {
    const config = usePreviousReadingMark("proj-1") as unknown as {
      queryKey: unknown[];
      enabled: boolean;
      staleTime: number;
    };
    expect(config.queryKey).toEqual([
      "project-reading-mark",
      "previous",
      "proj-1",
    ]);
    expect(config.enabled).toBe(false);
    expect(config.staleTime).toBe(Infinity);
  });
});
