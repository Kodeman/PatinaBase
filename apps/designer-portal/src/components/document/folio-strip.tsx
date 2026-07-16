'use client';

/**
 * The Folio (R24) — a thin strip of files clipped under a section head or
 * on a line unfold. Drag-anywhere-on-the-section lands here (the page
 * forwards drops); a re-upload stacks behind its predecessor with the
 * Desk's stacked-edge recipe — one click slides older versions out. Files
 * open in the full-screen paper viewer, never a new tab. Per-file
 * client_visible, default studio-only.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildChains,
  matchesAnchor,
  useFolioFiles,
  useSetFolioVisibility,
  useUploadFolioFile,
  useProposalFolioFiles,
  useSetProposalFolioVisibility,
  useUploadProposalFolioFile,
  type FolioAnchor,
  type FolioChain,
  type FolioFile,
} from '@/hooks/use-folio';
import { DocFileViewer } from './overlays/doc-file-viewer';
import { fmtDay } from '@/lib/document/format';

const SECTION_LABELS: Record<string, string> = {
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
};

function FileChip({
  chain,
  onOpen,
  onToggleVisibility,
}: {
  chain: FolioChain;
  onOpen: (f: FolioFile) => void;
  onToggleVisibility: (f: FolioFile) => void;
}) {
  const [slidOut, setSlidOut] = useState(false);
  const { head, versions } = chain;
  const stacked = versions.length > 0;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block">
        {/* The Desk's stacked edges, scaled to a chip: versions behind. */}
        {stacked && (
          <>
            <span
              aria-hidden
              className="absolute bottom-[-3px] left-[3px] right-[-3px] top-[3px] rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-3)]"
            />
            <span
              aria-hidden
              className="absolute bottom-[-1.5px] left-[1.5px] right-[-1.5px] top-[1.5px] rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]"
            />
          </>
        )}
        <span className="relative z-[1] inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-2 py-[3px]">
          <button
            type="button"
            onClick={() => onOpen(head)}
            className="max-w-[180px] truncate text-[10.5px] text-[var(--color-charcoal)] hover:text-[var(--color-clay)]"
            title={head.title}
          >
            {head.title}
          </button>
          {stacked && (
            <button
              type="button"
              onClick={() => setSlidOut((v) => !v)}
              aria-expanded={slidOut}
              className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
              title={slidOut ? 'Slide versions back' : 'Slide older versions out'}
            >
              v{versions.length + 1}
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleVisibility(head)}
            className="font-mono text-[8.5px] uppercase tracking-[0.05em]"
            style={{ color: head.client_visible ? '#85947C' : 'var(--color-aged-oak, #8B7355)' }}
            title={
              head.client_visible
                ? 'Shared — the client mirror renders this file'
                : 'Studio only — click to share with the client'
            }
          >
            {head.client_visible ? 'shared' : 'studio'}
          </button>
        </span>
      </span>
      {slidOut &&
        versions.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onOpen(v)}
            className="rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-2 py-[3px] text-[10px] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]"
            title={`Superseded ${fmtDay(v.created_at)}`}
          >
            {fmtDay(v.created_at)}
          </button>
        ))}
    </span>
  );
}

export function FolioStrip({
  projectId,
  anchor,
  /** Files dropped on the surrounding section (the folio catches them). */
  droppedFiles = null,
  onDropConsumed = () => {},
  sectionDragOver = false,
}: {
  projectId: string;
  anchor: FolioAnchor;
  droppedFiles?: File[] | null;
  onDropConsumed?: () => void;
  sectionDragOver?: boolean;
}) {
  const router = useRouter();
  const { data: files } = useFolioFiles(projectId);
  const upload = useUploadFolioFile(projectId);
  const setVisibility = useSetFolioVisibility(projectId);
  const [dragOver, setDragOver] = useState(false);
  const [viewing, setViewing] = useState<FolioFile | null>(null);
  // I74a — a scan clipped into the folio opens the Room View (`/room/[id]`),
  // not the paper file viewer. No producer writes scan chips yet (doc_type is
  // img/pdf/…), so this door is dormant today; a scan chip would carry the
  // room_scan id in storage_path. Real files keep the DocFileViewer door.
  const openFolioFile = (f: FolioFile) => {
    if (f.doc_type === 'scan' && f.storage_path) {
      router.push(`/room/${f.storage_path}?from=document`);
    } else {
      setViewing(f);
    }
  };
  const inputRef = useRef<HTMLInputElement>(null);

  const chains = buildChains((files ?? []).filter((f) => matchesAnchor(f, anchor)));

  // Drops caught by the whole section land on this strip (R24).
  useEffect(() => {
    if (!droppedFiles?.length) return;
    for (const file of droppedFiles) upload.mutate({ file, anchor });
    onDropConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFiles]);

  const catching = dragOver || sectionDragOver;

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          for (const file of Array.from(e.dataTransfer.files ?? [])) {
            upload.mutate({ file, anchor });
          }
        }}
        className={`my-1.5 flex flex-wrap items-center gap-2 rounded-[3px] px-1 py-1 transition-colors ${
          catching
            ? 'border border-dashed border-[var(--color-clay)] bg-[rgba(196,165,123,0.06)]'
            : 'border border-dashed border-transparent'
        }`}
      >
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Folio{chains.length > 0 ? ` · ${chains.length}` : ''}
        </span>
        {chains.map((chain) => (
          <FileChip
            key={chain.head.id}
            chain={chain}
            onOpen={openFolioFile}
            onToggleVisibility={(f) =>
              setVisibility.mutate({ fileId: f.id, clientVisible: !f.client_visible })
            }
          />
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
        >
          {catching ? 'drop to clip it here' : upload.isPending ? 'clipping…' : '+ file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            for (const file of Array.from(e.target.files ?? [])) {
              upload.mutate({ file, anchor });
            }
            e.target.value = '';
          }}
        />
      </div>
      {viewing && <DocFileViewer file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/**
 * The Proposal folio (R85) — the folio strip on a proposal-stage document,
 * before a project exists. Keyed on proposals.id (00252). Space plans clipped
 * here reach the client's proposal copy once flagged 'shared' (the client read
 * leg in 00252). A drop-anywhere target + a file picker; re-uploads stack as
 * versions, exactly like the project strip. Files open in the paper viewer.
 */
export function ProposalFolioStrip({ proposalId }: { proposalId: string }) {
  const { data: files } = useProposalFolioFiles(proposalId);
  const upload = useUploadProposalFolioFile(proposalId);
  const setVisibility = useSetProposalFolioVisibility(proposalId);
  const [dragOver, setDragOver] = useState(false);
  const [viewing, setViewing] = useState<FolioFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chains = buildChains(files ?? []);

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          for (const file of Array.from(e.dataTransfer.files ?? [])) {
            upload.mutate({ file });
          }
        }}
        className={`my-1.5 flex flex-wrap items-center gap-2 rounded-[3px] px-1 py-1 transition-colors ${
          dragOver
            ? 'border border-dashed border-[var(--color-clay)] bg-[rgba(196,165,123,0.06)]'
            : 'border border-dashed border-transparent'
        }`}
      >
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Folio{chains.length > 0 ? ` · ${chains.length}` : ''}
        </span>
        {chains.map((chain) => (
          <FileChip
            key={chain.head.id}
            chain={chain}
            onOpen={setViewing}
            onToggleVisibility={(f) =>
              setVisibility.mutate({ fileId: f.id, clientVisible: !f.client_visible })
            }
          />
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
        >
          {dragOver ? 'drop to clip it here' : upload.isPending ? 'clipping…' : '+ file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            for (const file of Array.from(e.target.files ?? [])) {
              upload.mutate({ file });
            }
            e.target.value = '';
          }}
        />
      </div>
      {viewing && <DocFileViewer file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** Letterhead unfold (R24): “The folio · N files”, grouped by section. */
export function FolioLetterhead({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: files } = useFolioFiles(projectId);
  const setVisibility = useSetFolioVisibility(projectId);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<FolioFile | null>(null);
  // I74a — same Room View scan door as FolioStrip (dormant until a scan chip
  // exists; real files keep the DocFileViewer door).
  const openFolioFile = (f: FolioFile) => {
    if (f.doc_type === 'scan' && f.storage_path) {
      router.push(`/room/${f.storage_path}?from=document`);
    } else {
      setViewing(f);
    }
  };

  const all = files ?? [];
  if (all.length === 0) return null;

  const chains = buildChains(all);
  const groups = new Map<string, FolioChain[]>();
  for (const chain of chains) {
    const key =
      chain.head.anchor_kind === 'section'
        ? (chain.head.section_key ?? 'project')
        : chain.head.anchor_kind === 'line'
          ? 'lines'
          : 'letterhead';
    groups.set(key, [...(groups.get(key) ?? []), chain]);
  }
  const groupLabel = (key: string) =>
    key === 'lines' ? 'On the lines' : key === 'letterhead' ? 'The letterhead' : SECTION_LABELS[key] ?? key;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
      >
        The folio · {chains.length} {chains.length === 1 ? 'file' : 'files'} {open ? '↑' : '↓'}
      </button>
      {open && (
        <div className="mt-1 border-t border-dashed border-[var(--color-pearl)] pt-1.5">
          {[...groups.entries()].map(([key, group]) => (
            <div key={key} className="mb-1.5 flex flex-wrap items-baseline gap-2">
              <span className="w-20 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                {groupLabel(key)}
              </span>
              {group.map((chain) => (
                <FileChip
                  key={chain.head.id}
                  chain={chain}
                  onOpen={openFolioFile}
                  onToggleVisibility={(f) =>
                    setVisibility.mutate({ fileId: f.id, clientVisible: !f.client_visible })
                  }
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {viewing && <DocFileViewer file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
