'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FolderPlus } from 'lucide-react';
import type {
  FfeAssignmentScope,
  FfeDesignDisposition,
} from '@patina/types';
import {
  useCreateNamedProjectNeed,
  usePlaceProductInProjectV2,
  type ProposalBoardSummary,
} from '@patina/supabase';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '@/components/portal/proposals/product-picker-modal';
import { ffeEvents } from '@/lib/analytics/ffe-events';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

type SheetMode = 'sources' | 'route_product' | 'name_need';

const FIELD_CLASS =
  'min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2.5 text-[13px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]';
const LABEL_CLASS =
  'mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

export function openAddToProject(source: 'section' | 'command_palette' | 'empty_state' = 'section') {
  window.dispatchEvent(new CustomEvent('document:open-add-to-project', { detail: { source } }));
}

function idempotencyKey(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

export function AddToProjectSheet({
  projectId,
  projectName,
  rooms,
  boards,
}: {
  projectId: string;
  projectName: string;
  rooms: Array<{ id: string; name: string }>;
  boards: ProposalBoardSummary[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const placeProduct = usePlaceProductInProjectV2();
  const createNeed = useCreateNamedProjectNeed();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SheetMode>('sources');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<ProductPickResult | null>(null);
  const [assignment, setAssignment] = useState<FfeAssignmentScope>('unassigned');
  const [roomId, setRoomId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [disposition, setDisposition] = useState<FfeDesignDisposition>('candidate');
  const [duplicateMode, setDuplicateMode] = useState<'reuse' | 'separate'>('reuse');
  const [needName, setNeedName] = useState('');
  const [needKind, setNeedKind] = useState<'placeholder' | 'allowance' | 'manual_product'>('placeholder');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const compatibleBoards = useMemo(
    () => boards.filter((board) => {
      const boardRoomId = board.project_room_id ?? board.scope_room_id;
      return assignment === 'room' ? boardRoomId === roomId : !boardRoomId;
    }),
    [assignment, boards, roomId],
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const source = (event as CustomEvent<{ source?: 'section' | 'command_palette' | 'empty_state' }>).detail?.source ?? 'section';
      ffeEvents.entranceOpened({ project_id: projectId, source });
      setOpen(true);
    };
    window.addEventListener('document:open-add-to-project', listener);
    return () => window.removeEventListener('document:open-add-to-project', listener);
  }, [projectId]);

  const reset = () => {
    setMode('sources');
    setPicked(null);
    setAssignment('unassigned');
    setRoomId('');
    setBoardId('');
    setDisposition('candidate');
    setDuplicateMode('reuse');
    setNeedName('');
    setNeedKind('placeholder');
    setQuantity('1');
    setError(null);
    setResult(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const chooseAssignment = (next: FfeAssignmentScope) => {
    setAssignment(next);
    setBoardId('');
    if (next !== 'room') setRoomId('');
  };

  const saveProduct = async () => {
    if (!picked || (assignment === 'room' && !roomId)) return;
    setError(null);
    try {
      const response = await placeProduct.mutateAsync({
        projectId,
        productId: picked.productId,
        captureId: picked.captureId ?? null,
        assignmentScope: assignment,
        projectRoomId: assignment === 'room' ? roomId : null,
        boardId: boardId || null,
        designDisposition: disposition,
        duplicateMode,
        configurationId: picked.configurationSelection?.savedConfigurationId ?? null,
        idempotencyKey: idempotencyKey('place'),
      });
      ffeEvents.routingChosen({
        project_id: projectId,
        assignment_scope: assignment,
        has_board: Boolean(boardId),
        disposition,
      });
      ffeEvents.placementCompleted({
        project_id: projectId,
        selection_id: response.selectionId,
        placement_id: response.placementId,
        outcome: response.outcome,
      });
      setResult(`${response.outcome === 'reused' ? 'Reused' : 'Added'} selection · ${picked.name}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The product could not be placed.');
      ffeEvents.failed({ project_id: projectId, operation: 'place', reason_code: 'rpc_error' });
    }
  };

  const saveNeed = async () => {
    if (!needName.trim() || (assignment === 'room' && !roomId)) return;
    setError(null);
    try {
      await createNeed.mutateAsync({
        projectId,
        name: needName.trim(),
        assignmentScope: assignment,
        projectRoomId: assignment === 'room' ? roomId : null,
        designDisposition: disposition,
        needKind,
        quantity: Math.max(1, Math.round(Number(quantity) || 1)),
        idempotencyKey: idempotencyKey('need'),
      });
      ffeEvents.routingChosen({
        project_id: projectId,
        assignment_scope: assignment,
        has_board: false,
        disposition,
      });
      setResult(`Added need · ${needName.trim()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The need could not be created.');
      ffeEvents.failed({ project_id: projectId, operation: 'place', reason_code: 'rpc_error' });
    }
  };

  const routeField = (
    <div className="grid gap-3 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className={LABEL_CLASS}>Place in</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {(['unassigned', 'throughout', 'room'] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              aria-pressed={assignment === scope}
              onClick={() => chooseAssignment(scope)}
              className={`min-h-11 rounded-[3px] border px-2 text-[11px] capitalize ${assignment === scope ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]' : 'border-[var(--color-pearl)] text-[var(--text-muted)]'}`}
            >
              {scope === 'unassigned' ? 'Unsorted' : scope}
            </button>
          ))}
        </div>
      </fieldset>
      {assignment === 'room' && (
        <label>
          <span className={LABEL_CLASS}>Room</span>
          <select value={roomId} onChange={(event) => { setRoomId(event.target.value); setBoardId(''); }} className={FIELD_CLASS}>
            <option value="">Choose room</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
      )}
      <label>
        <span className={LABEL_CLASS}>Design status</span>
        <select value={disposition} onChange={(event) => setDisposition(event.target.value as FfeDesignDisposition)} className={FIELD_CLASS}>
          <option value="candidate">Candidate</option>
          <option value="selected">Selected</option>
          <option value="alternate">Alternate</option>
          <option value="not_selected">Not selected</option>
        </select>
      </label>
    </div>
  );

  return (
    <>
      <DocSheet open={open} onClose={close} icon={FolderPlus} title="Add to project" pageLabel={projectName}>
        {mode === 'sources' && !result && (
          <div className="divide-y divide-[var(--color-pearl)] border-y border-[var(--color-pearl)]">
            {[
              ['Start a board', 'Concept, selections, materials, or blank.', () => {
                close();
                window.dispatchEvent(new CustomEvent('document:new-project-board'));
              }],
              ['Browse the Library', 'Choose one known product, then route it here.', () => setPickerOpen(true)],
              ['Paste a product link', 'Capture through the guarded URL intake, then route it here.', () => setPickerOpen(true)],
              ['Name a need', 'Add a placeholder, allowance, or manual product.', () => setMode('name_need')],
              ['Import a schedule', 'Map CSV or XLSX rows before any selections are created.', () => {
                router.push(`/library?projectId=${encodeURIComponent(projectId)}&import=1&returnTo=${encodeURIComponent(`${pathname}#project-ffe`)}`);
                close();
              }],
            ].map(([label, description, action]) => (
              <button key={String(label)} type="button" onClick={action as () => void} className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left">
                <span>
                  <span className="block font-heading text-[14px] text-[var(--color-charcoal)]">{String(label)}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{String(description)}</span>
                </span>
                <span aria-hidden className="text-[var(--color-clay)]">→</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'route_product' && picked && !result && (
          <>
            <p className="mb-3 font-heading text-[15px] text-[var(--color-charcoal)]">{picked.name}</p>
            {routeField}
            <label className="mt-3 block">
              <span className={LABEL_CLASS}>Optional board placement</span>
              <select value={boardId} onChange={(event) => setBoardId(event.target.value)} className={FIELD_CLASS}>
                <option value="">No board</option>
                {compatibleBoards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
              </select>
            </label>
            <fieldset className="mt-3">
              <legend className={LABEL_CLASS}>If this product is already in the project</legend>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" aria-pressed={duplicateMode === 'reuse'} onClick={() => setDuplicateMode('reuse')} className={`${FIELD_CLASS} ${duplicateMode === 'reuse' ? 'border-[var(--color-clay)]' : ''}`}>Reuse selection</button>
                <button type="button" aria-pressed={duplicateMode === 'separate'} onClick={() => setDuplicateMode('separate')} className={`${FIELD_CLASS} ${duplicateMode === 'separate' ? 'border-[var(--color-clay)]' : ''}`}>Separate need</button>
              </div>
            </fieldset>
            <DocumentActionGroup surfaceKey="project" regionKey="add-to-project" className="mt-4">
              <DocumentAction actionKey="place-product-in-project" variant="primary" disabled={assignment === 'room' && !roomId} loading={placeProduct.isPending} onClick={() => void saveProduct()}>
                Add selection
              </DocumentAction>
            </DocumentActionGroup>
          </>
        )}

        {mode === 'name_need' && !result && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className={LABEL_CLASS}>Need</span><input autoFocus value={needName} onChange={(event) => setNeedName(event.target.value)} placeholder="Pair of reading chairs" className={FIELD_CLASS} /></label>
              <label><span className={LABEL_CLASS}>Kind</span><select value={needKind} onChange={(event) => setNeedKind(event.target.value as typeof needKind)} className={FIELD_CLASS}><option value="placeholder">Placeholder</option><option value="allowance">Allowance</option><option value="manual_product">Manual product</option></select></label>
              <label><span className={LABEL_CLASS}>Quantity</span><input type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={FIELD_CLASS} /></label>
            </div>
            <div className="mt-3">{routeField}</div>
            <DocumentActionGroup surfaceKey="project" regionKey="add-to-project" className="mt-4">
              <DocumentAction actionKey="create-named-project-need" variant="primary" disabled={!needName.trim() || (assignment === 'room' && !roomId)} loading={createNeed.isPending} onClick={() => void saveNeed()}>
                Add the need
              </DocumentAction>
            </DocumentActionGroup>
          </>
        )}

        {result && (
          <div role="status" className="border-y border-[var(--color-pearl)] py-5">
            <p className="font-heading text-[15px] text-[var(--color-charcoal)]">{result}</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">The project selection is ready below. Review and authorization remain separate acts.</p>
            <DocumentAction actionKey="finish-add-to-project" surfaceKey="project" regionKey="add-to-project-result" variant="primary" className="mt-4" onClick={close}>Return to Project · FF&amp;E</DocumentAction>
          </div>
        )}

        {error && <p role="alert" className="mt-3 text-[11px] text-[var(--color-clay)]">{error}</p>}
      </DocSheet>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(result) => {
          setPicked(result);
          setPickerOpen(false);
          setMode('route_product');
        }}
        rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
        scope="library"
        configureStep
      />
    </>
  );
}
