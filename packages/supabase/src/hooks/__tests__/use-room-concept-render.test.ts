/**
 * `useRoomConceptRender` — the studio's only write path into the private
 * `room-renders` bucket and the four columns 00580 added to `project_rooms`.
 *
 * Mocked at the same two boundaries every other hook suite here uses
 * (`@supabase/ssr` for the client, `@tanstack/react-query` for the mutation),
 * so `mutationFn` and `onSuccess` can be invoked directly without a React tree
 * or a database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let uploadResult: { error: unknown } = { error: null };
let updateResult: { error: unknown } = { error: null };

const upload = vi.fn(async (_path: string, _file: unknown, _opts: unknown) => uploadResult);
const storageFrom = vi.fn((_bucket: string) => ({ upload }));

const eqProject = vi.fn(async () => updateResult);
const eqRoom = vi.fn(() => ({ eq: eqProject }));
const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: eqRoom }));
const from = vi.fn((_table: string) => ({ update }));

const getUser = vi.fn(async () => ({ data: { user: { id: 'user-9' } } }));
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    storage: { from: storageFrom },
    from,
    auth: { getUser },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER the mocks are wired up.
import {
  useRoomConceptRender,
  roomConceptRenderPath,
  roomConceptRenderRoomsKey,
  roomConceptRenderThresholdKey,
  ROOM_RENDERS_BUCKET,
} from '../use-room-concept-render';

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

function png(name = 'dining.png'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

beforeEach(() => {
  uploadResult = { error: null };
  updateResult = { error: null };
  upload.mockClear();
  storageFrom.mockClear();
  from.mockClear();
  update.mockClear();
  eqRoom.mockClear();
  eqProject.mockClear();
  getUser.mockClear();
  invalidateQueries.mockClear();
});

describe('useRoomConceptRender', () => {
  it('uploads to <projectId>/<roomId>/<filename> in the private bucket', async () => {
    const file = png();
    const result = await mutation().mutationFn({
      projectId: 'proj-1',
      roomId: 'room-2',
      file,
    });

    expect(storageFrom).toHaveBeenCalledWith(ROOM_RENDERS_BUCKET);
    expect(upload).toHaveBeenCalledWith('proj-1/room-2/dining.png', file, {
      contentType: 'image/png',
      upsert: true,
    });
    expect(result).toEqual({ path: 'proj-1/room-2/dining.png' });
    expect(roomConceptRenderPath('proj-1', 'room-2', 'dining.png')).toBe(
      'proj-1/room-2/dining.png',
    );
  });

  it('writes the four columns on the room it was given, scoped to its project', async () => {
    await mutation().mutationFn({
      projectId: 'proj-1',
      roomId: 'room-2',
      file: png(),
      caption: '  The dining room looking north  ',
    });

    expect(from).toHaveBeenCalledWith('project_rooms');
    const payload = update.mock.calls[0][0];
    expect(payload.concept_render_url).toBe('proj-1/room-2/dining.png');
    expect(payload.concept_render_caption).toBe('The dining room looking north');
    expect(payload.concept_render_uploaded_by).toBe('user-9');
    expect(typeof payload.concept_render_uploaded_at).toBe('string');
    expect(Number.isNaN(Date.parse(payload.concept_render_uploaded_at as string))).toBe(false);

    expect(eqRoom).toHaveBeenCalledWith('id', 'room-2');
    expect(eqProject).toHaveBeenCalledWith('project_id', 'proj-1');
  });

  it('records a blank caption as absence rather than an empty string', async () => {
    await mutation().mutationFn({
      projectId: 'proj-1',
      roomId: 'room-2',
      file: png(),
      caption: '   ',
    });

    const payload = update.mock.calls[0][0];
    expect(payload.concept_render_caption).toBeNull();
  });

  it('never writes the row when the upload fails', async () => {
    uploadResult = { error: new Error('storage refused') };

    await expect(
      mutation().mutationFn({ projectId: 'proj-1', roomId: 'room-2', file: png() }),
    ).rejects.toThrow('storage refused');

    expect(from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('surfaces a failed row write', async () => {
    updateResult = { error: new Error('row refused') };

    await expect(
      mutation().mutationFn({ projectId: 'proj-1', roomId: 'room-2', file: png() }),
    ).rejects.toThrow('row refused');
  });

  it('invalidates both the rooms read and the threshold read', () => {
    mutation().onSuccess({ path: 'proj-1/room-2/dining.png' }, { projectId: 'proj-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: roomConceptRenderRoomsKey('proj-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: roomConceptRenderThresholdKey('proj-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
