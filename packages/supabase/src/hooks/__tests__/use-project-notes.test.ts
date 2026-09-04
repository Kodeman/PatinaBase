import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — same rig as use-decisions.test.ts: intercept `@supabase/ssr` (what
// `createBrowserClient()` actually calls) and stub `@tanstack/react-query` so
// each `useQuery`/`useMutation` call returns its config object verbatim,
// letting us invoke `queryFn`/`mutationFn`/`onSuccess` directly without
// rendering. `react`'s `useEffect` is stubbed to run synchronously and stash
// its cleanup, for `useProjectNotesRealtime`.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  insert: any;
  update: any;
  eq: any;
  order: any;
  single: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
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
  builder.insert = record("insert");
  builder.update = record("update");
  builder.eq = record("eq");
  builder.order = record("order");

  builder.single = vi.fn(() => {
    builder.__chain.push({ method: "single", args: [] });
    return Promise.resolve(builder.__result);
  });

  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

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

// Realtime channel stub — `.channel().on().subscribe()` chain.
const channelOn = vi.fn();
const channelSubscribe = vi.fn();
const fakeChannel: Record<string, unknown> = {};
fakeChannel.on = vi.fn((..._args: unknown[]) => {
  channelOn(..._args);
  return fakeChannel;
});
fakeChannel.subscribe = vi.fn(() => {
  channelSubscribe();
  return fakeChannel;
});
const channelFactory = vi.fn(() => fakeChannel);
const removeChannel = vi.fn();

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
  rpc: vi.fn(),
  channel: channelFactory,
  removeChannel,
};

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

let lastEffectCleanup: (() => void) | void;
vi.mock("react", () => ({
  useEffect: (fn: () => (() => void) | void) => {
    lastEffectCleanup = fn();
  },
}));

import {
  projectNotesKeys,
  useProjectNotes,
  useSendProjectNote,
  useRetireProjectNote,
  useProjectNotesRealtime,
  type ProjectNote,
} from "../use-project-notes";

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(builders)) delete builders[key];
  lastEffectCleanup = undefined;
});

describe("projectNotesKeys", () => {
  it("shapes the all and list keys", () => {
    expect(projectNotesKeys.all).toEqual(["project-notes"]);
    expect(projectNotesKeys.list("proj-1")).toEqual([
      "project-notes",
      "proj-1",
    ]);
  });
});

interface QueryConfig {
  queryKey: unknown[];
  queryFn: () => Promise<ProjectNote[]>;
  enabled: boolean;
}

describe("useProjectNotes", () => {
  it("uses the project list query key and is disabled without a projectId", () => {
    const config = useProjectNotes(undefined) as unknown as QueryConfig;
    expect(config.enabled).toBe(false);

    const configWithId = useProjectNotes("proj-1") as unknown as QueryConfig;
    expect(configWithId.queryKey).toEqual(["project-notes", "proj-1"]);
    expect(configWithId.enabled).toBe(true);
  });

  it("selects by project_id ordered by sent_at desc and maps snake_case to camelCase", async () => {
    setTableResult("project_notes", {
      data: [
        {
          id: "note-1",
          project_id: "proj-1",
          author_id: "author-1",
          body: "A line to the client.",
          enclosures: [{ kind: "proposal", id: "prop-1" }],
          state: "standing",
          sent_at: "2026-09-04T00:00:00.000Z",
          answered_at: null,
          retired_at: null,
          created_at: "2026-09-04T00:00:00.000Z",
          updated_at: "2026-09-04T00:00:00.000Z",
        },
      ],
      error: null,
    });

    const config = useProjectNotes("proj-1") as unknown as QueryConfig;
    const notes = await config.queryFn();

    const builder = builders.project_notes;
    expect(callsTo(builder, "select")).toHaveLength(1);
    expect(callsTo(builder, "eq")[0].args).toEqual(["project_id", "proj-1"]);
    expect(callsTo(builder, "order")[0].args).toEqual([
      "sent_at",
      { ascending: false },
    ]);

    expect(notes).toEqual([
      {
        id: "note-1",
        projectId: "proj-1",
        authorId: "author-1",
        body: "A line to the client.",
        enclosures: [{ kind: "proposal", id: "prop-1" }],
        state: "standing",
        sentAt: "2026-09-04T00:00:00.000Z",
        answeredAt: null,
        retiredAt: null,
      },
    ]);
  });

  it("returns an empty array for null data", async () => {
    setTableResult("project_notes", { data: null, error: null });
    const config = useProjectNotes("proj-1") as unknown as QueryConfig;
    expect(await config.queryFn()).toEqual([]);
  });

  it("throws on a query error", async () => {
    setTableResult("project_notes", { data: null, error: new Error("boom") });
    const config = useProjectNotes("proj-1") as unknown as QueryConfig;
    await expect(config.queryFn()).rejects.toThrow("boom");
  });
});

describe("useSendProjectNote", () => {
  it("inserts with author_id from the authenticated user and returns the mapped note", async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "author-1" } },
    });
    setTableResult("project_notes", {
      data: {
        id: "note-1",
        project_id: "proj-1",
        author_id: "author-1",
        body: "Three last pieces for the library.",
        enclosures: [],
        state: "standing",
        sent_at: "2026-09-04T00:00:00.000Z",
        answered_at: null,
        retired_at: null,
        created_at: "2026-09-04T00:00:00.000Z",
        updated_at: "2026-09-04T00:00:00.000Z",
      },
      error: null,
    });

    const config = useSendProjectNote() as unknown as {
      mutationFn: (input: unknown) => Promise<ProjectNote>;
    };
    const result = await config.mutationFn({
      projectId: "proj-1",
      body: "Three last pieces for the library.",
      enclosures: [{ kind: "proposal", id: "prop-1" }],
    });

    const builder = builders.project_notes;
    expect(callsTo(builder, "insert")[0].args[0]).toEqual({
      project_id: "proj-1",
      author_id: "author-1",
      body: "Three last pieces for the library.",
      enclosures: [{ kind: "proposal", id: "prop-1" }],
    });
    expect(callsTo(builder, "select")).toHaveLength(1);
    expect(callsTo(builder, "single")).toHaveLength(1);
    expect(result.id).toBe("note-1");
  });

  it("defaults enclosures to an empty array when omitted", async () => {
    supabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "author-1" } },
    });
    setTableResult("project_notes", {
      data: {
        id: "note-1",
        project_id: "proj-1",
        author_id: "author-1",
        body: "No enclosures.",
        enclosures: [],
        state: "standing",
        sent_at: "2026-09-04T00:00:00.000Z",
        answered_at: null,
        retired_at: null,
        created_at: "2026-09-04T00:00:00.000Z",
        updated_at: "2026-09-04T00:00:00.000Z",
      },
      error: null,
    });

    const config = useSendProjectNote() as unknown as {
      mutationFn: (input: unknown) => Promise<ProjectNote>;
    };
    await config.mutationFn({ projectId: "proj-1", body: "No enclosures." });

    const builder = builders.project_notes;
    expect(callsTo(builder, "insert")[0].args[0]).toMatchObject({
      enclosures: [],
    });
  });

  it("throws when there is no authenticated user", async () => {
    supabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } });
    const config = useSendProjectNote() as unknown as {
      mutationFn: (input: unknown) => Promise<ProjectNote>;
    };
    await expect(
      config.mutationFn({ projectId: "proj-1", body: "hi" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("invalidates the project note list on success", () => {
    const config = useSendProjectNote() as unknown as {
      onSuccess: (data: ProjectNote, variables: { projectId: string }) => void;
    };
    config.onSuccess({} as ProjectNote, { projectId: "proj-1" });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["project-notes", "proj-1"],
    });
  });
});

describe("useRetireProjectNote", () => {
  it("updates state to retired with a retired_at timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));

    setTableResult("project_notes", {
      data: {
        id: "note-1",
        project_id: "proj-1",
        author_id: "author-1",
        body: "Retired note.",
        enclosures: [],
        state: "retired",
        sent_at: "2026-09-01T00:00:00.000Z",
        answered_at: null,
        retired_at: "2026-09-04T12:00:00.000Z",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-04T12:00:00.000Z",
      },
      error: null,
    });

    const config = useRetireProjectNote() as unknown as {
      mutationFn: (input: unknown) => Promise<ProjectNote>;
    };
    await config.mutationFn({ noteId: "note-1", projectId: "proj-1" });

    const builder = builders.project_notes;
    expect(callsTo(builder, "update")[0].args[0]).toEqual({
      state: "retired",
      retired_at: "2026-09-04T12:00:00.000Z",
    });
    expect(callsTo(builder, "eq")[0].args).toEqual(["id", "note-1"]);

    vi.useRealTimers();
  });

  it("invalidates the project note list on success", () => {
    const config = useRetireProjectNote() as unknown as {
      onSuccess: (
        data: ProjectNote,
        variables: { noteId: string; projectId: string },
      ) => void;
    };
    config.onSuccess({} as ProjectNote, {
      noteId: "note-1",
      projectId: "proj-1",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["project-notes", "proj-1"],
    });
  });
});

describe("useProjectNotesRealtime", () => {
  it("subscribes to project_notes filtered by project_id and cleans up on unmount", () => {
    useProjectNotesRealtime("proj-1");

    expect(channelFactory).toHaveBeenCalledWith("project-notes:proj-1");
    expect(channelOn).toHaveBeenCalledTimes(1);
    const [event, filterConfig] = channelOn.mock.calls[0] as [
      string,
      { event: string; schema: string; table: string; filter: string },
    ];
    expect(event).toBe("postgres_changes");
    expect(filterConfig).toEqual({
      event: "*",
      schema: "public",
      table: "project_notes",
      filter: "project_id=eq.proj-1",
    });
    expect(channelSubscribe).toHaveBeenCalledTimes(1);

    expect(typeof lastEffectCleanup).toBe("function");
    (lastEffectCleanup as () => void)();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("invalidates the list on a change event", () => {
    useProjectNotesRealtime("proj-1");
    const handler = channelOn.mock.calls[0][2] as () => void;
    handler();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["project-notes", "proj-1"],
    });
  });

  it("is a no-op when projectId is undefined", () => {
    useProjectNotesRealtime(undefined);
    expect(channelFactory).not.toHaveBeenCalled();
  });
});
