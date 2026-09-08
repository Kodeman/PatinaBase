'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ROOM CONCEPT RENDER — the studio's write path into the PRIVATE `room-renders`
// bucket and the four columns 00580 added to `project_rooms`.
//
// Layout, enforced by storage RLS: room-renders/<project_id>/<room_id>/<filename>
// All four object policies gate on the first path segment through
// app_private.is_project_studio_member, so a studio can only ever write under a
// project it stands on.
//
// The upload happens FIRST and the row is written only if it landed. A row
// pointing at an object that does not exist would print an empty plate on the
// client's page under a label that says "Concept" — a claim with nothing behind
// it — so a failed upload leaves the room exactly as it was.
// ═══════════════════════════════════════════════════════════════════════════

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

/** The private concept-render bucket (00580). */
export const ROOM_RENDERS_BUCKET = 'room-renders';

/** What the bucket's `file_size_limit` allows (00580). */
export const ROOM_RENDER_MAX_BYTES = 8 * 1024 * 1024;

/** What the bucket's `allowed_mime_types` allows (00580). */
export const ROOM_RENDER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface UploadRoomConceptRenderInput {
  projectId: string;
  roomId: string;
  file: File;
  /** The studio's own words under the plate. The on-image "Concept · not
   *  installed" label is the page's, not this. */
  caption?: string | null;
}

export interface UploadRoomConceptRenderResult {
  /** The object path inside `room-renders`, which is what the column stores. */
  path: string;
}

/** The room read `useProjectRooms` issues (use-project-v2.ts:124). */
export const roomConceptRenderRoomsKey = (projectId: string) =>
  ['project-rooms', projectId] as const;

/** The client page's threshold read (client-portal use-commercial-client.ts:22).
 *  Stated literally because that key lives in the portal, not in this package. */
export const roomConceptRenderThresholdKey = (projectId: string) =>
  ['client-selections', projectId] as const;

export function roomConceptRenderPath(projectId: string, roomId: string, fileName: string) {
  return `${projectId}/${roomId}/${fileName}`;
}

/**
 * Upload one concept render for a room, then point the room at it.
 *
 * Replacing a render overwrites the object at the same path (`upsert`), so a
 * room never accumulates orphans it has stopped referring to.
 */
export function useRoomConceptRender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      roomId,
      file,
      caption,
    }: UploadRoomConceptRenderInput): Promise<UploadRoomConceptRenderResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const path = roomConceptRenderPath(projectId, roomId, file.name);

      const { error: uploadError } = await supabase.storage
        .from(ROOM_RENDERS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const trimmed = typeof caption === 'string' ? caption.trim() : '';

      const { error: rowError } = await supabase
        .from('project_rooms')
        .update({
          concept_render_url: path,
          concept_render_caption: trimmed.length > 0 ? trimmed : null,
          concept_render_uploaded_at: new Date().toISOString(),
          concept_render_uploaded_by: user?.id ?? null,
        })
        .eq('id', roomId)
        .eq('project_id', projectId);
      if (rowError) throw rowError;

      return { path };
    },
    onSuccess: (_result, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: roomConceptRenderRoomsKey(projectId) });
      queryClient.invalidateQueries({ queryKey: roomConceptRenderThresholdKey(projectId) });
    },
  });
}
