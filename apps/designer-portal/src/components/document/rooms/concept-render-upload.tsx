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
 * The read and the removal are done here rather than through a hook because
 * `useRoomConceptRender` (Wave 1, Lane A2) exposes the upload only, and this
 * lane may not edit `packages/supabase`. Both are plain awaited calls rather
 * than React Query reads: this component mounts under every room heading in
 * `ffe-section.tsx`, and several existing suites mount that section with no
 * QueryClientProvider at all.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import {
  createBrowserClient,
  useRoomConceptRender,
  ROOM_RENDERS_BUCKET,
  ROOM_RENDER_MAX_BYTES,
  ROOM_RENDER_MIME_TYPES,
} from '@patina/supabase';
import { DocumentAction } from '@/components/document/document-action';
import { fmtDay } from '@/lib/document/format';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** The client page's on-image label. Stated here as the studio's consent line,
 *  before the upload — the studio is told what the page will say. */
export const CONCEPT_RENDER_CONSENT =
  "Labeled 'Concept · not installed' on the client's page";

export interface ConceptRenderRecord {
  path: string;
  caption: string | null;
  uploadedAt: string | null;
  signedUrl: string | null;
}

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

export function conceptRenderCaptionLine(record: ConceptRenderRecord): string {
  return [
    'Concept render',
    record.caption,
    record.uploadedAt ? `uploaded ${fmtDay(record.uploadedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

async function readConceptRender(
  projectId: string,
  roomId: string,
): Promise<ConceptRenderRecord | null> {
  const supabase = createBrowserClient() as any;
  const { data, error } = await supabase
    .from('project_rooms')
    .select(
      'concept_render_url, concept_render_caption, concept_render_uploaded_at',
    )
    .eq('id', roomId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error || !data?.concept_render_url) return null;

  const path = data.concept_render_url as string;
  let signedUrl: string | null = null;
  try {
    const signed = await supabase.storage
      .from(ROOM_RENDERS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    signedUrl = signed?.data?.signedUrl ?? null;
  } catch {
    signedUrl = null;
  }

  return {
    path,
    caption: (data.concept_render_caption as string | null) ?? null,
    uploadedAt: (data.concept_render_uploaded_at as string | null) ?? null,
    signedUrl,
  };
}

async function clearConceptRender(projectId: string, roomId: string) {
  const supabase = createBrowserClient() as any;
  const { error } = await supabase
    .from('project_rooms')
    .update({
      concept_render_url: null,
      concept_render_caption: null,
      concept_render_uploaded_at: null,
      concept_render_uploaded_by: null,
    })
    .eq('id', roomId)
    .eq('project_id', projectId);
  if (error) throw error;
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

export function ConceptRenderUpload({
  projectId,
  roomId,
  roomName,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
}) {
  const [record, setRecord] = useState<ConceptRenderRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const next = await readConceptRender(projectId, roomId);
        if (alive) setRecord(next);
      } catch {
        // A room whose render cannot be read shows no render — never a
        // broken plate under a label that claims one.
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, roomId, reload]);

  const remove = useCallback(async () => {
    setRemoving(true);
    setReason(null);
    try {
      await clearConceptRender(projectId, roomId);
      setRecord(null);
      setOpen(false);
    } catch {
      setReason("The render did not come down. It is still on the client's page.");
    } finally {
      setRemoving(false);
    }
  }, [projectId, roomId]);

  return (
    <div className="mb-1" data-concept-render-room={roomId}>
      {record && (
        <div className="flex items-start gap-2.5 pt-0.5">
          {record.signedUrl && (
            <img
              src={record.signedUrl}
              alt={record.caption ?? `Concept render for ${roomName}`}
              className="h-[92px] w-[92px] shrink-0 rounded-[3px] border border-[var(--color-pearl)] object-cover"
            />
          )}
          <p className="max-w-[56ch] pt-0.5 text-[12px] leading-[1.5] text-[var(--text-subtle)]">
            {conceptRenderCaptionLine(record)}
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
          actionKey={
            record ? 'replace-room-concept-render' : 'open-room-concept-render'
          }
          surfaceKey="project"
          regionKey="room-concept-render"
          variant="tertiary"
          aria-expanded={open}
          onClick={() => {
            setReason(null);
            setOpen((was) => !was);
          }}
        >
          {record ? 'Replace' : 'Add a concept render'}
        </DocumentAction>
        {record && (
          <DocumentAction
            actionKey="remove-room-concept-render"
            surfaceKey="project"
            regionKey="room-concept-render"
            variant="tertiary"
            loading={removing}
            loadingLabel="Removing"
            onClick={remove}
          >
            Remove
          </DocumentAction>
        )}
      </div>

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
