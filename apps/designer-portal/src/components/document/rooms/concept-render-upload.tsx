'use client';

/**
 * PP-7 / R142 — the studio's own concept render, put on the client's page from
 * the room heading the studio already works at. No route: the act unfolds in
 * place.
 *
 * The bucket (00580) is PRIVATE and carries its own MIME and size limits. Those
 * limits are re-stated as the client-side gate — imported from the hook's
 * module, never retyped — so the studio hears the reason before the server
 * would have given one it could not read.
 *
 * WHY THIS IS THREE COMPONENTS AND NOT ONE. This mounts under EVERY room
 * heading in `ffe-section.tsx`, and fifteen suites mount that section with no
 * QueryClientProvider and a `jest.mock('@patina/supabase')` factory that
 * defines only the hooks the section itself uses (D6's finding). A React Query
 * hook called from the always-mounted body would throw in all of them. So the
 * body that is always mounted calls no hook at all:
 *
 *   ConceptRenderUpload   always mounted · hook-free · runs one probe (a single
 *                         column, no signing) that answers only "does this room
 *                         have a render?"
 *   StandingConceptRender mounts only once the answer is yes · reads the record
 *                         through `useRoomConceptRenderRecord` (which re-signs
 *                         the private-bucket URL on its own schedule, where a
 *                         one-shot effect would keep handing out an hour-old
 *                         link) and takes it down through
 *                         `useRemoveRoomConceptRender` — the hook that deletes
 *                         the storage object BEFORE nulling the row, so a
 *                         removal can never leave an orphan behind the client's
 *                         page.
 *   ConceptRenderForm     mounts only after the studio opens the act · carries
 *                         the upload hook.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import {
  createBrowserClient,
  useRoomConceptRender,
  useRoomConceptRenderRecord,
  useRemoveRoomConceptRender,
  ROOM_RENDER_MAX_BYTES,
  ROOM_RENDER_MIME_TYPES,
} from '@patina/supabase';
import { DocumentAction } from '@/components/document/document-action';
import { fmtDay } from '@/lib/document/format';

/** The client page's on-image label. Stated here as the studio's consent line,
 *  before the upload — the studio is told what the page will say. */
export const CONCEPT_RENDER_CONSENT =
  "Labeled 'Concept · not installed' on the client's page";

const asMegabytes = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
};

/** The named reason a file is refused, or null when it is allowed. */
export function conceptRenderRejection(file: {
  type: string;
  size: number;
}): string | null {
  if (!(ROOM_RENDER_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'That file is not a JPEG, PNG or WebP. A concept render has to be one of those three.';
  }
  if (file.size > ROOM_RENDER_MAX_BYTES) {
    return `That file is ${asMegabytes(file.size)} MB. A concept render has to be ${asMegabytes(
      ROOM_RENDER_MAX_BYTES,
    )} MB or under.`;
  }
  return null;
}

export function conceptRenderCaptionLine(record: {
  caption: string | null;
  uploadedAt: string | null;
}): string {
  return [
    'Concept render',
    record.caption,
    record.uploadedAt ? `uploaded ${fmtDay(record.uploadedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Does this room have a render? One column, no signing, no hook — the question
 * the always-mounted body is allowed to ask. Everything else about the render
 * is read by the hook inside `StandingConceptRender`.
 */
async function roomHasConceptRender(
  projectId: string,
  roomId: string,
): Promise<boolean> {
  const supabase = createBrowserClient() as any;
  const { data, error } = await supabase
    .from('project_rooms')
    .select('concept_render_url')
    .eq('id', roomId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.concept_render_url);
}

function ConceptRenderForm({
  projectId,
  roomId,
  onUploaded,
  onCancel,
}: {
  projectId: string;
  roomId: string;
  onUploaded: () => void;
  onCancel: () => void;
}) {
  const upload = useRoomConceptRender();
  const fieldId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [reason, setReason] = useState<string | null>(null);

  const choose = (chosen: File | null) => {
    if (!chosen) {
      setFile(null);
      return;
    }
    const rejection = conceptRenderRejection(chosen);
    if (rejection) {
      setFile(null);
      setReason(rejection);
      return;
    }
    setReason(null);
    setFile(chosen);
  };

  const send = async () => {
    if (!file) return;
    setReason(null);
    try {
      await upload.mutateAsync({ projectId, roomId, file, caption });
      onUploaded();
    } catch {
      setReason('The render did not upload. Nothing on the page has changed.');
    }
  };

  return (
    <div className="mt-1.5 border-l border-[var(--color-pearl)] pl-2.5">
      <label
        htmlFor={`${fieldId}-file`}
        className="block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
      >
        Image file
      </label>
      <input
        id={`${fieldId}-file`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => choose(e.target.files?.[0] ?? null)}
        className="mt-1 block min-h-11 w-full max-w-[360px] py-2 text-[12px] text-[var(--color-charcoal)]"
      />

      <label
        htmlFor={`${fieldId}-caption`}
        className="mt-2 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
      >
        Caption
      </label>
      <input
        id={`${fieldId}-caption`}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="what this render shows"
        className="mt-1 block min-h-11 w-full max-w-[360px] border-b border-dashed border-[var(--color-pearl)] bg-transparent py-1.5 text-[13px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)]"
      />

      <p className="mt-2 max-w-[56ch] text-[12px] leading-[1.5] text-[var(--text-subtle)]">
        {CONCEPT_RENDER_CONSENT}
      </p>

      {reason && (
        <p
          role="alert"
          className="mt-1.5 max-w-[56ch] text-[12px] leading-[1.5] text-[var(--color-terracotta-ink)]"
        >
          {reason}
        </p>
      )}

      <div className="flex items-center gap-1">
        {file && (
          <DocumentAction
            actionKey="upload-room-concept-render"
            surfaceKey="project"
            regionKey="room-concept-render"
            variant="secondary"
            loading={upload.isPending}
            loadingLabel="Uploading"
            onClick={send}
          >
            Upload
          </DocumentAction>
        )}
        <DocumentAction
          actionKey="cancel-room-concept-render"
          surfaceKey="project"
          regionKey="room-concept-render"
          variant="tertiary"
          onClick={onCancel}
        >
          Cancel
        </DocumentAction>
      </div>
    </div>
  );
}

function StandingConceptRender({
  projectId,
  roomId,
  roomName,
  formOpen,
  onToggleForm,
  onRemoved,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
  formOpen: boolean;
  onToggleForm: () => void;
  onRemoved: () => void;
}) {
  const record = useRoomConceptRenderRecord({ projectId, roomId });
  const removal = useRemoveRoomConceptRender();
  const [reason, setReason] = useState<string | null>(null);

  const standing = record.data ?? null;

  const remove = useCallback(async () => {
    if (!standing) return;
    setReason(null);
    try {
      await removal.mutateAsync({ projectId, roomId, path: standing.path });
      onRemoved();
    } catch {
      setReason("The render did not come down. It is still on the client's page.");
    }
  }, [projectId, roomId, removal, standing, onRemoved]);

  return (
    <>
      {standing && (
        <div className="flex items-start gap-2.5 pt-0.5">
          {standing.url && (
            <img
              src={standing.url}
              alt={standing.caption ?? `Concept render for ${roomName}`}
              className="h-[92px] w-[92px] shrink-0 rounded-[3px] border border-[var(--color-pearl)] object-cover"
            />
          )}
          <p className="max-w-[56ch] pt-0.5 text-[12px] leading-[1.5] text-[var(--text-subtle)]">
            {conceptRenderCaptionLine(standing)}
          </p>
        </div>
      )}

      {reason && (
        <p
          role="alert"
          className="mt-1.5 max-w-[56ch] text-[12px] leading-[1.5] text-[var(--color-terracotta-ink)]"
        >
          {reason}
        </p>
      )}

      <div className="flex items-center gap-1">
        <DocumentAction
          actionKey="replace-room-concept-render"
          surfaceKey="project"
          regionKey="room-concept-render"
          variant="tertiary"
          aria-expanded={formOpen}
          onClick={() => {
            setReason(null);
            onToggleForm();
          }}
        >
          Replace
        </DocumentAction>
        {standing && (
          <DocumentAction
            actionKey="remove-room-concept-render"
            surfaceKey="project"
            regionKey="room-concept-render"
            variant="tertiary"
            loading={removal.isPending}
            loadingLabel="Removing"
            onClick={remove}
          >
            Remove
          </DocumentAction>
        )}
      </div>
    </>
  );
}

export function ConceptRenderUpload({
  projectId,
  roomId,
  roomName,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
}) {
  /** null while the probe has not answered — a room says nothing rather than
   *  offering an act whose label would then reverse itself. */
  const [standing, setStanding] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const has = await roomHasConceptRender(projectId, roomId);
        if (alive) setStanding(has);
      } catch {
        // A room whose render cannot be read shows no render — never a
        // broken plate under a label that claims one.
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, roomId, reload]);

  return (
    <div className="mb-1" data-concept-render-room={roomId}>
      {standing === true && (
        <StandingConceptRender
          projectId={projectId}
          roomId={roomId}
          roomName={roomName}
          formOpen={open}
          onToggleForm={() => setOpen((was) => !was)}
          onRemoved={() => {
            setStanding(false);
            setOpen(false);
          }}
        />
      )}

      {standing === false && (
        <div className="flex items-center gap-1">
          <DocumentAction
            actionKey="open-room-concept-render"
            surfaceKey="project"
            regionKey="room-concept-render"
            variant="tertiary"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            Add a concept render
          </DocumentAction>
        </div>
      )}

      {open && (
        <ConceptRenderForm
          projectId={projectId}
          roomId={roomId}
          onUploaded={() => {
            setOpen(false);
            setReload((n) => n + 1);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
