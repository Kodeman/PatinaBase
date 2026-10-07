'use client';

import { useState } from 'react';
import {
  useInstallManifest,
  useInstallPunchItems,
  useRecordFfeInstalled,
  useResolveInstallPunchItem,
  useUpsertInstallManifestItem,
  useUpsertInstallPunchItem,
  type InstallManifestItemRow,
  type InstallManifestRequest,
  type InstallPunchItemRow,
  type InstallPunchRequest,
  type InstallState,
  type RecordFfeInstalledInput,
} from '@patina/supabase';
import { fmtDay, todayYmd } from '@/lib/document/format';
import { uploadInspectionPhoto } from '@/components/portal/procurement/log-inspection-drawer';
import { inspectionPhotoIds } from '../line-unfold/inspection-photo-strip';
import { DocumentAction } from '../document-action';
import { CellSub, FIELD_CLS, LABEL_CLS } from '../line-unfold/cell';

/**
 * C-34 (D1-09): the install manifest. Each delivered line carries where it
 * goes, the install day, who installs it and where it stands. "Mark
 * installed" is the line's own record_project_ffe_installed (00691). Punch
 * items hang off the line: a note, photos through the media proxy, a due
 * day, open until resolved. They block nothing; close-out lists them.
 */

export const INSTALL_STATE_WORD: Record<InstallState, string> = {
  planned: 'Planned',
  at_receiver: 'At the receiver',
  on_site: 'On site',
  deferred: 'Deferred',
};

const STATES: InstallState[] = ['planned', 'at_receiver', 'on_site', 'deferred'];

export interface ManifestLine {
  id: string;
  name: string;
  status: string | null;
  roomName: string | null;
  installedOn: string | null;
}

export interface ManifestDraft {
  roomLocation: string;
  installOn: string;
  installerName: string;
  state: InstallState | '';
}

export function manifestDraft(row: InstallManifestItemRow | undefined): ManifestDraft {
  return {
    roomLocation: row?.room_location ?? '',
    installOn: row?.install_on ?? '',
    installerName: row?.installer_name ?? '',
    state: (row?.state as InstallState | undefined) ?? '',
  };
}

/**
 * Only the keys that changed, trimmed; a cleared field sends null. Null when
 * nothing changed. A state cleared on an existing row is left alone (the
 * column is required).
 */
export function manifestPatch(
  row: InstallManifestItemRow | undefined,
  draft: ManifestDraft,
): InstallManifestRequest | null {
  const before = manifestDraft(row);
  const request: InstallManifestRequest = {};
  const text = (value: string) => value.trim() || null;
  if (draft.roomLocation.trim() !== before.roomLocation) request.roomLocation = text(draft.roomLocation);
  if (draft.installOn !== before.installOn) request.installOn = draft.installOn || null;
  if (draft.installerName.trim() !== before.installerName) request.installerName = text(draft.installerName);
  if (draft.state && draft.state !== before.state) request.state = draft.state;
  return Object.keys(request).length > 0 ? request : null;
}

/** "Mark installed" for one line: placed today. */
export function markInstalledArgs(projectId: string, itemId: string): RecordFfeInstalledInput {
  return { projectId, itemIds: [itemId], installedOn: todayYmd() };
}

/** A new punch item on a line; null until the note says something. */
export function newPunchRequest(
  itemId: string,
  note: string,
  dueOn: string,
  mediaIds: readonly string[],
): InstallPunchRequest | null {
  const trimmed = note.trim();
  if (!trimmed) return null;
  return {
    ffeItemId: itemId,
    note: trimmed,
    ...(dueOn ? { dueOn } : {}),
    ...(mediaIds.length > 0 ? { mediaIds: [...mediaIds] } : {}),
  };
}

/** The manifest's facts in one line. */
export function manifestFacts(line: ManifestLine, row: InstallManifestItemRow | undefined): string {
  const facts: string[] = [];
  if (row?.room_location) facts.push(row.room_location);
  if (line.status === 'installed') {
    facts.push(line.installedOn ? `installed ${fmtDay(line.installedOn)}` : 'installed');
  } else {
    if (row?.state) facts.push(INSTALL_STATE_WORD[row.state as InstallState]?.toLowerCase() ?? row.state);
    if (row?.install_on) facts.push(`install ${fmtDay(row.install_on)}`);
  }
  if (row?.installer_name) facts.push(row.installer_name);
  return facts.join(' · ') || 'Nothing set yet';
}

function punchFacts(item: InstallPunchItemRow): string {
  const facts = [item.note];
  if (item.resolved_at) facts.push(`resolved ${fmtDay(item.resolved_at)}`);
  else if (item.due_on) facts.push(`due ${fmtDay(item.due_on)}`);
  const photos = inspectionPhotoIds(item.media_ids).length;
  if (photos > 0) facts.push(`${photos} ${photos === 1 ? 'photo' : 'photos'}`);
  return facts.join(' · ');
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
      {message}
    </p>
  );
}

function ManifestFields({ line, row }: { line: ManifestLine; row: InstallManifestItemRow | undefined }) {
  const upsert = useUpsertInstallManifestItem({ errorSurface: 'inline' });
  const [draft, setDraft] = useState<ManifestDraft>(() => manifestDraft(row));
  const [error, setError] = useState<string | null>(null);
  const patch = manifestPatch(row, draft);
  const set = (key: keyof ManifestDraft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    if (!patch) return;
    setError(null);
    upsert
      .mutateAsync({ ffeItemId: line.id, request: patch })
      .catch((e: Error) => setError(e.message || 'The manifest was not saved.'));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Goes</span>
          <input
            aria-label={`Where ${line.name} goes`}
            value={draft.roomLocation}
            maxLength={200}
            placeholder={line.roomName ?? 'room, wall'}
            disabled={upsert.isPending}
            onChange={(e) => set('roomLocation')(e.target.value)}
            className={`w-32 ${FIELD_CLS}`}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Install</span>
          <input
            type="date"
            aria-label={`Install day for ${line.name}`}
            value={draft.installOn}
            disabled={upsert.isPending}
            onChange={(e) => set('installOn')(e.target.value)}
            className={FIELD_CLS}
          />
        </label>
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Installer</span>
          <input
            aria-label={`Installer for ${line.name}`}
            value={draft.installerName}
            maxLength={200}
            disabled={upsert.isPending}
            onChange={(e) => set('installerName')(e.target.value)}
            className={`w-28 ${FIELD_CLS}`}
          />
        </label>
        <select
          aria-label={`Install state for ${line.name}`}
          value={draft.state}
          disabled={upsert.isPending}
          onChange={(e) => set('state')(e.target.value)}
          className={FIELD_CLS}
        >
          {!row && <option value="">State</option>}
          {STATES.map((state) => (
            <option key={state} value={state}>
              {INSTALL_STATE_WORD[state]}
            </option>
          ))}
        </select>
        {patch && (
          <DocumentAction
            actionKey="save-install-manifest"
            surfaceKey="project"
            regionKey="ffe-install-manifest"
            variant="tertiary"
            loading={upsert.isPending}
            onClick={save}
          >
            Save
          </DocumentAction>
        )}
      </div>
      <ErrorLine message={error} />
    </div>
  );
}

function MarkInstalled({ projectId, line }: { projectId: string; line: ManifestLine }) {
  const record = useRecordFfeInstalled({ errorSurface: 'inline' });
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    setError(null);
    record
      .mutateAsync(markInstalledArgs(projectId, line.id))
      .catch((e: Error) => setError(e.message || 'The line was not marked installed.'));
  };
  return (
    <>
      <DocumentAction
        actionKey="mark-ffe-line-installed"
        surfaceKey="project"
        regionKey="ffe-install-manifest"
        variant="tertiary"
        loading={record.isPending}
        loadingLabel="Saving…"
        onClick={run}
      >
        Mark installed
      </DocumentAction>
      <ErrorLine message={error} />
    </>
  );
}

function PunchItem({ item }: { item: InstallPunchItemRow }) {
  const resolve = useResolveInstallPunchItem({ errorSurface: 'inline' });
  const [error, setError] = useState<string | null>(null);
  return (
    <li data-testid="install-punch-item" className="flex flex-wrap items-baseline gap-x-3">
      <span className={`text-[11px] ${item.resolved_at ? 'text-[var(--text-muted)]' : 'text-[var(--color-charcoal)]'}`}>
        {punchFacts(item)}
      </span>
      {!item.resolved_at && (
        <DocumentAction
          actionKey="resolve-install-punch"
          surfaceKey="project"
          regionKey="ffe-install-punch"
          variant="tertiary"
          loading={resolve.isPending}
          onClick={() => {
            setError(null);
            resolve
              .mutateAsync({ punchId: item.id })
              .catch((e: Error) => setError(e.message || 'The punch item was not resolved.'));
          }}
        >
          Resolve
        </DocumentAction>
      )}
      <ErrorLine message={error} />
    </li>
  );
}

function AddPunch({ projectId, line }: { projectId: string; line: ManifestLine }) {
  const upsert = useUpsertInstallPunchItem({ errorSurface: 'inline' });
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = upsert.isPending || uploading > 0;
  const request = newPunchRequest(line.id, note, dueOn, mediaIds);

  if (!open) {
    return (
      <DocumentAction
        actionKey="open-install-punch"
        surfaceKey="project"
        regionKey="ffe-install-punch"
        variant="tertiary"
        onClick={() => setOpen(true)}
      >
        Punch
      </DocumentAction>
    );
  }

  const close = () => {
    setOpen(false);
    setNote('');
    setDueOn('');
    setMediaIds([]);
    setError(null);
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const assetId = await uploadInspectionPhoto(file, projectId);
        setMediaIds((prev) => [...prev, assetId]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const save = () => {
    if (!request) return;
    setError(null);
    upsert
      .mutateAsync(request)
      .then(close)
      .catch((e: Error) => setError(e.message || 'The punch item was not recorded.'));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <input
          aria-label={`Punch note for ${line.name}`}
          value={note}
          maxLength={2000}
          placeholder="touch-up on left arm"
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          className={`w-48 ${FIELD_CLS}`}
        />
        <label className="flex items-baseline gap-1.5">
          <span className={LABEL_CLS}>Due</span>
          <input
            type="date"
            aria-label="Punch due on"
            value={dueOn}
            disabled={busy}
            onChange={(e) => setDueOn(e.target.value)}
            className={FIELD_CLS}
          />
        </label>
        <label className={`cursor-pointer ${LABEL_CLS}`}>
          {uploading > 0
            ? 'Uploading…'
            : mediaIds.length > 0
              ? `${mediaIds.length} ${mediaIds.length === 1 ? 'photo' : 'photos'} · add more`
              : 'Add photos'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            className="sr-only"
            disabled={busy || mediaIds.length >= 20}
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <DocumentAction
          actionKey="record-install-punch"
          surfaceKey="project"
          regionKey="ffe-install-punch"
          variant="secondary"
          loading={upsert.isPending}
          disabled={!request || uploading > 0}
          onClick={save}
        >
          Record it
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-install-punch"
          surfaceKey="project"
          regionKey="ffe-install-punch"
          variant="tertiary"
          disabled={busy}
          onClick={close}
        >
          Put back
        </DocumentAction>
      </div>
      <ErrorLine message={error} />
    </div>
  );
}

/** Delivered and installed lines, each with its manifest row and punch items. */
export function InstallManifest({
  projectId,
  lines,
}: {
  projectId: string;
  lines: readonly ManifestLine[];
}) {
  const manifest = useInstallManifest(projectId);
  const punch = useInstallPunchItems(projectId, true);
  const shown = lines.filter((line) => line.status === 'delivered' || line.status === 'installed');
  if (shown.length === 0) return null;
  const rowFor = new Map((manifest.data ?? []).map((row) => [row.ffe_item_id, row]));

  // 0a-2 (D6): no count here — the region's rows print each piece's state word.
  return (
    <section
      aria-label="Install manifest"
      data-testid="install-manifest"
      className="mt-3 border-t border-[var(--color-pearl)] pt-2"
    >
      <p className={LABEL_CLS}>Install manifest</p>
      {manifest.isError && <CellSub>The manifest could not be read.</CellSub>}
      <ul>
        {shown.map((line) => {
          const row = rowFor.get(line.id);
          const punchItems = (punch.data ?? []).filter((item) => item.ffe_item_id === line.id);
          return (
            <li
              key={line.id}
              data-testid="install-manifest-line"
              className="flex flex-col gap-1 border-b border-[var(--color-pearl)] py-2"
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[12px] font-medium text-[var(--color-charcoal)]">{line.name}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{manifestFacts(line, row)}</span>
                {line.status === 'delivered' && <MarkInstalled projectId={projectId} line={line} />}
              </div>
              {line.status === 'delivered' && !manifest.isLoading && (
                <ManifestFields key={row?.updated_at ?? 'new'} line={line} row={row} />
              )}
              {punchItems.length > 0 && (
                <ul aria-label={`Punch items for ${line.name}`} className="flex flex-col gap-0.5">
                  {punchItems.map((item) => (
                    <PunchItem key={item.id} item={item} />
                  ))}
                </ul>
              )}
              <AddPunch projectId={projectId} line={line} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
