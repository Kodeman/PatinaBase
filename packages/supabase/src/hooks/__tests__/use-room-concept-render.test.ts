/**
 * `useRoomConceptRender` / `useRoomConceptRenderRecord` / `useRemoveRoomConceptRender`
 * — the studio's write, read and remove paths into the private `room-renders`
 * bucket and the four columns 00580 added to `project_rooms`.
 *
 * Mocked at the same two boundaries every other hook suite here uses
 * (`@supabase/ssr` for the client, `@tanstack/react-query` for the
 * query/mutation), so `queryFn`/`mutationFn`/`onSuccess` can be invoked
 * directly without a React tree or a database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let uploadResult: { error: unknown } = { error: null };
let updateResult: { error: unknown } = { error: null };
let removeResult: { error: unknown } = { error: null };
let selectResult: { data: Record<string, unknown> | null; error: unknown } = {
  data: null,
  error: null,
};
let signedUrlResult: { data: { signedUrl: string } | null; error: unknown } = {
  data: { signedUrl: "https://signed.example/render.png" },
  error: null,
};

const upload = vi.fn(
  async (_path: string, _file: unknown, _opts: unknown) => uploadResult,
);
const createSignedUrl = vi.fn(
  async (_path: string, _ttlSeconds: number) => signedUrlResult,
);
const remove = vi.fn(async (_paths: string[]) => removeResult);
const storageFrom = vi.fn((_bucket: string) => ({
  upload,
  createSignedUrl,
  remove,
}));

const eqProject = vi.fn(async () => updateResult);
const eqRoom = vi.fn(() => ({ eq: eqProject }));
const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: eqRoom }));

const maybeSingle = vi.fn(async () => selectResult);
const selectEqProject = vi.fn(() => ({ maybeSingle }));
const selectEqRoom = vi.fn(() => ({ eq: selectEqProject }));
const select = vi.fn((_columns: string) => ({ eq: selectEqRoom }));

const from = vi.fn((_table: string) => ({ update, select }));

const getUser = vi.fn(async () => ({ data: { user: { id: "user-9" } } }));
const invalidateQueries = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    storage: { from: storageFrom },
    from,
    auth: { getUser },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER the mocks are wired up.
import {
  useRoomConceptRender,
  useRoomConceptRenderRecord,
  useRemoveRoomConceptRender,
  roomConceptRenderPath,
  roomConceptRenderRoomsKey,
  roomConceptRenderThresholdKey,
  roomConceptRenderRecordKey,
  ROOM_RENDERS_BUCKET,
  ROOM_CONCEPT_RENDER_SIGNED_URL_SECONDS,
  type RoomConceptRenderRecord,
} from "../use-room-concept-render";

interface MutationConfig {
  mutationFn: (input: {
    projectId: string;
    roomId: string;
    file: File;
    caption?: string | null;
  }) => Promise<{ path: string }>;
  onSuccess: (result: { path: string }, input: { projectId: string }) => void;
}

function mutation(): MutationConfig {
  return useRoomConceptRender() as unknown as MutationConfig;
}

interface RecordQueryConfig {
  queryFn: () => Promise<RoomConceptRenderRecord | null>;
  enabled: boolean;
}

function recordQuery(
  input: Parameters<typeof useRoomConceptRenderRecord>[0],
): RecordQueryConfig {
  return useRoomConceptRenderRecord(input) as unknown as RecordQueryConfig;
}

interface RemoveMutationConfig {
  mutationFn: (input: {
    projectId: string;
    roomId: string;
    path: string;
  }) => Promise<void>;
  onSuccess: (
    result: void,
    input: { projectId: string; roomId: string },
  ) => void;
}

function removeMutation(): RemoveMutationConfig {
  return useRemoveRoomConceptRender() as unknown as RemoveMutationConfig;
}

function png(name = "dining.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

beforeEach(() => {
  uploadResult = { error: null };
  updateResult = { error: null };
  removeResult = { error: null };
  selectResult = { data: null, error: null };
  signedUrlResult = {
    data: { signedUrl: "https://signed.example/render.png" },
    error: null,
  };
  upload.mockClear();
  createSignedUrl.mockClear();
  remove.mockClear();
  storageFrom.mockClear();
  from.mockClear();
  update.mockClear();
  select.mockClear();
  maybeSingle.mockClear();
  eqRoom.mockClear();
  eqProject.mockClear();
  selectEqRoom.mockClear();
  selectEqProject.mockClear();
  getUser.mockClear();
  invalidateQueries.mockClear();
});

describe("useRoomConceptRender", () => {
  it("uploads to <projectId>/<roomId>/<filename> in the private bucket", async () => {
    const file = png();
    const result = await mutation().mutationFn({
      projectId: "proj-1",
      roomId: "room-2",
      file,
    });

    expect(storageFrom).toHaveBeenCalledWith(ROOM_RENDERS_BUCKET);
    expect(upload).toHaveBeenCalledWith("proj-1/room-2/dining.png", file, {
      contentType: "image/png",
      upsert: true,
    });
    expect(result).toEqual({ path: "proj-1/room-2/dining.png" });
    expect(roomConceptRenderPath("proj-1", "room-2", "dining.png")).toBe(
      "proj-1/room-2/dining.png",
    );
  });

  it("writes the four columns on the room it was given, scoped to its project", async () => {
    await mutation().mutationFn({
      projectId: "proj-1",
      roomId: "room-2",
      file: png(),
      caption: "  The dining room looking north  ",
    });

    expect(from).toHaveBeenCalledWith("project_rooms");
    const payload = update.mock.calls[0][0];
    expect(payload.concept_render_url).toBe("proj-1/room-2/dining.png");
    expect(payload.concept_render_caption).toBe(
      "The dining room looking north",
    );
    expect(payload.concept_render_uploaded_by).toBe("user-9");
    expect(typeof payload.concept_render_uploaded_at).toBe("string");
    expect(
      Number.isNaN(Date.parse(payload.concept_render_uploaded_at as string)),
    ).toBe(false);

    expect(eqRoom).toHaveBeenCalledWith("id", "room-2");
    expect(eqProject).toHaveBeenCalledWith("project_id", "proj-1");
  });

  it("records a blank caption as absence rather than an empty string", async () => {
    await mutation().mutationFn({
      projectId: "proj-1",
      roomId: "room-2",
      file: png(),
      caption: "   ",
    });

    const payload = update.mock.calls[0][0];
    expect(payload.concept_render_caption).toBeNull();
  });

  it("never writes the row when the upload fails", async () => {
    uploadResult = { error: new Error("storage refused") };

    await expect(
      mutation().mutationFn({
        projectId: "proj-1",
        roomId: "room-2",
        file: png(),
      }),
    ).rejects.toThrow("storage refused");

    expect(from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("surfaces a failed row write", async () => {
    updateResult = { error: new Error("row refused") };

    await expect(
      mutation().mutationFn({
        projectId: "proj-1",
        roomId: "room-2",
        file: png(),
      }),
    ).rejects.toThrow("row refused");
  });

  it("invalidates both the rooms read and the threshold read", () => {
    mutation().onSuccess(
      { path: "proj-1/room-2/dining.png" },
      { projectId: "proj-1" },
    );

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: roomConceptRenderRoomsKey("proj-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: roomConceptRenderThresholdKey("proj-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});

describe("useRoomConceptRenderRecord", () => {
  it("is null when the room has no stored path", async () => {
    selectResult = {
      data: {
        concept_render_url: null,
        concept_render_caption: null,
        concept_render_uploaded_at: null,
        concept_render_uploaded_by: null,
      },
      error: null,
    };

    const result = await recordQuery({
      projectId: "proj-1",
      roomId: "room-2",
    }).queryFn();

    expect(result).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("is null when the room row itself is absent", async () => {
    selectResult = { data: null, error: null };

    const result = await recordQuery({
      projectId: "proj-1",
      roomId: "room-2",
    }).queryFn();

    expect(result).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("requests a signed URL for the stored path, and returns the four fields plus it", async () => {
    selectResult = {
      data: {
        concept_render_url: "proj-1/room-2/dining.png",
        concept_render_caption: "The dining room looking north",
        concept_render_uploaded_at: "2026-09-01T00:00:00.000Z",
        concept_render_uploaded_by: "user-9",
      },
      error: null,
    };
    signedUrlResult = {
      data: { signedUrl: "https://signed.example/dining.png" },
      error: null,
    };

    const result = await recordQuery({
      projectId: "proj-1",
      roomId: "room-2",
    }).queryFn();

    expect(from).toHaveBeenCalledWith("project_rooms");
    expect(select).toHaveBeenCalledWith(
      "concept_render_url, concept_render_caption, concept_render_uploaded_at, concept_render_uploaded_by",
    );
    expect(selectEqRoom).toHaveBeenCalledWith("id", "room-2");
    expect(selectEqProject).toHaveBeenCalledWith("project_id", "proj-1");
    expect(storageFrom).toHaveBeenCalledWith(ROOM_RENDERS_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "proj-1/room-2/dining.png",
      ROOM_CONCEPT_RENDER_SIGNED_URL_SECONDS,
    );
    expect(ROOM_CONCEPT_RENDER_SIGNED_URL_SECONDS).toBe(3600);
    expect(result).toEqual({
      url: "https://signed.example/dining.png",
      path: "proj-1/room-2/dining.png",
      caption: "The dining room looking north",
      uploadedAt: "2026-09-01T00:00:00.000Z",
      uploadedBy: "user-9",
    });
  });

  it("returns a null url (not a throw) when signing fails", async () => {
    selectResult = {
      data: {
        concept_render_url: "proj-1/room-2/dining.png",
        concept_render_caption: null,
        concept_render_uploaded_at: null,
        concept_render_uploaded_by: null,
      },
      error: null,
    };
    signedUrlResult = { data: null, error: new Error("sign failed") };

    const result = await recordQuery({
      projectId: "proj-1",
      roomId: "room-2",
    }).queryFn();

    expect(result?.url).toBeNull();
    expect(result?.path).toBe("proj-1/room-2/dining.png");
  });

  it("rejects when the row read itself errors", async () => {
    selectResult = { data: null, error: new Error("row read refused") };

    await expect(
      recordQuery({ projectId: "proj-1", roomId: "room-2" }).queryFn(),
    ).rejects.toThrow("row read refused");
  });

  it("is disabled while projectId or roomId is unset", () => {
    expect(recordQuery({ projectId: null, roomId: "room-2" }).enabled).toBe(
      false,
    );
    expect(
      recordQuery({ projectId: "proj-1", roomId: undefined }).enabled,
    ).toBe(false);
    expect(recordQuery({ projectId: "proj-1", roomId: "room-2" }).enabled).toBe(
      true,
    );
  });

  it("keys the read by project and room", () => {
    expect(roomConceptRenderRecordKey("proj-1", "room-2")).toEqual([
      "project-room-concept-render",
      "proj-1",
      "room-2",
    ]);
  });
});

describe("useRemoveRoomConceptRender", () => {
  it("deletes the object from the private bucket before nulling the row", async () => {
    await removeMutation().mutationFn({
      projectId: "proj-1",
      roomId: "room-2",
      path: "proj-1/room-2/dining.png",
    });

    expect(storageFrom).toHaveBeenCalledWith(ROOM_RENDERS_BUCKET);
    expect(remove).toHaveBeenCalledWith(["proj-1/room-2/dining.png"]);
    expect(from).toHaveBeenCalledWith("project_rooms");

    const payload = update.mock.calls[0][0];
    expect(payload).toEqual({
      concept_render_url: null,
      concept_render_caption: null,
      concept_render_uploaded_at: null,
      concept_render_uploaded_by: null,
    });
    expect(eqRoom).toHaveBeenCalledWith("id", "room-2");
    expect(eqProject).toHaveBeenCalledWith("project_id", "proj-1");

    // The delete must precede the row write, not merely both happen.
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
  });

  it("never nulls the row when the delete fails", async () => {
    removeResult = { error: new Error("storage refused") };

    await expect(
      removeMutation().mutationFn({
        projectId: "proj-1",
        roomId: "room-2",
        path: "proj-1/room-2/dining.png",
      }),
    ).rejects.toThrow("storage refused");

    expect(update).not.toHaveBeenCalled();
  });

  it("surfaces a failed row null-out (object is already gone by then)", async () => {
    updateResult = { error: new Error("row refused") };

    await expect(
      removeMutation().mutationFn({
        projectId: "proj-1",
        roomId: "room-2",
        path: "proj-1/room-2/dining.png",
      }),
    ).rejects.toThrow("row refused");

    expect(remove).toHaveBeenCalledWith(["proj-1/room-2/dining.png"]);
  });

  it("invalidates the record key, the rooms key and the threshold key", () => {
    removeMutation().onSuccess(undefined, {
      projectId: "proj-1",
      roomId: "room-2",
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: roomConceptRenderRecordKey("proj-1", "room-2"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: roomConceptRenderRoomsKey("proj-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: roomConceptRenderThresholdKey("proj-1"),
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
  });
});
