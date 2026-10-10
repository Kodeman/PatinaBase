'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useCreateNamedProjectNeed,
  useFfeComSpec,
  useFfePairLines,
  useLinkFfePair,
  useUpdateFfeComSpec,
  type ComSpec,
  type FfePairLine,
} from '@patina/supabase';
import { formatTenths, readYardage, type YardageInput } from '@/lib/document/com-yardage';
import { DocumentAction } from '../document-action';
import { CellSub, FIELD_CLS, LABEL_CLS } from '../line-unfold/cell';
import { LineSubmittals } from './submittals';

/**
 * C-24 (D1-04): the custom piece. A frame and its COM fabric are two lines,
 * the fabric pointing at its piece (`parent_ffe_item_id`, link_ffe_pair). The
 * piece carries the COM facts (`project_ffe_specs.com_spec`, keyed like a
 * configuration's `com_details` so po-send prints both alike) and the yardage
 * helper. Both lines show the pair. The fabric line is an ordinary line: its
 * trade and client price read like any other, and its markup is the studio's
 * normal markup (V1 rules only the maker lane).
 */

type FFERow = any;

export const comFabricName = (pieceName: string) => `${pieceName} — COM fabric`;

export interface PairReading {
  /** The piece this line's fabric supplies. */
  parent: FfePairLine | null;
  /** The fabric lines that supply this piece. */
  children: FfePairLine[];
  /** Lines that could be linked as this piece's fabric. */
  candidates: FfePairLine[];
  /** The line is itself on a piece (COM, labor or accessory), so takes no COM. */
  onPiece: boolean;
}

type LinkFacts = { parent_ffe_item_id?: string | null; link_kind?: string | null };

/**
 * The piece a line's COM fabric supplies. A labor or accessory child also
 * points at its piece (link_kind, 00729), but only a 'com' link is the pair.
 */
const comParentId = (line: LinkFacts): string | null =>
  line.link_kind === 'com' ? (line.parent_ffe_item_id ?? null) : null;

/** Where a line sits in a pair, from the project's live lines. */
export function readPair(
  item: { id: string } & LinkFacts,
  lines: readonly FfePairLine[],
): PairReading {
  const self = lines.find((l) => l.id === item.id) ?? item;
  const parentId = comParentId(self);
  // Linkability is one level of any kind, as link_ffe_pair checks it: a line
  // already on a piece, or a piece with any child, is not linkable.
  const isParent = (id: string) => lines.some((l) => l.parent_ffe_item_id === id);
  return {
    parent: parentId ? (lines.find((l) => l.id === parentId) ?? null) : null,
    children: lines.filter((l) => comParentId(l) === item.id),
    candidates: lines.filter((l) => l.id !== item.id && !l.parent_ffe_item_id && !isParent(l.id)),
    onPiece: !!self.parent_ffe_item_id,
  };
}

type PieceForFabric = {
  id: string;
  name: string;
  project_room_id?: string | null;
  assignment_scope?: string | null;
};

/**
 * "This piece takes COM": add the fabric as a new line beside the piece and
 * link it as the piece's child. Shared by the unfold and the add sheet.
 */
export function useAddComFabricLine() {
  const create = useCreateNamedProjectNeed();
  const link = useLinkFfePair({ errorSurface: 'inline' });
  const add = async (projectId: string, piece: PieceForFabric): Promise<string> => {
    const roomId = piece.project_room_id ?? null;
    const created = await create.mutateAsync({
      projectId,
      name: comFabricName(piece.name),
      quantity: 1,
      itemType: 'tbd',
      assignmentScope: roomId
        ? 'room'
        : piece.assignment_scope === 'unassigned'
          ? 'unassigned'
          : 'throughout',
      roomId,
      disposition: 'candidate',
      source: 'named-need',
      idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `com-fabric-${piece.id}-${Date.now()}`,
    });
    if (!created.selectionId) throw new Error('The fabric line was not added.');
    await link.mutateAsync({ childId: created.selectionId, parentId: piece.id });
    return created.selectionId;
  };
  return { add, isPending: create.isPending || link.isPending };
}

// ─── The COM facts and the yardage helper ──────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The helper's inputs, kept beside com_details' keys so it reopens as left. */
interface YardageHelperFields {
  chartYards?: number | null;
  widthIn?: number | null;
  repeatIn?: number | null;
  workroomYards?: number | null;
}

type ComForm = Record<
  | 'fabricName'
  | 'mill'
  | 'pattern'
  | 'shipTo'
  | 'sidemark'
  | 'secondLeadTimeWeeks'
  | 'notes'
  | 'chartYards'
  | 'widthIn'
  | 'repeatIn'
  | 'workroomYards',
  string
> & { railroaded: boolean };

function formFromSpec(raw: unknown): ComForm {
  const spec = isRecord(raw) ? raw : {};
  const helper = isRecord(spec.yardageHelper) ? spec.yardageHelper : {};
  return {
    fabricName: text(spec.fabricName),
    mill: text(spec.mill),
    pattern: text(spec.pattern),
    shipTo: text(spec.shipTo),
    sidemark: text(spec.sidemark),
    secondLeadTimeWeeks: text(spec.secondLeadTimeWeeks),
    notes: text(spec.notes),
    railroaded: spec.railroaded === true,
    chartYards: text(helper.chartYards),
    widthIn: text(helper.widthIn),
    repeatIn: text(helper.repeatIn),
    workroomYards: text(helper.workroomYards),
  };
}

/** The com_spec a form writes: com_details' keys, plus the helper's inputs. */
export function specFromForm(form: ComForm, yardage: string | null): ComSpec & {
  yardageHelper?: YardageHelperFields;
} {
  const spec: ComSpec & { yardageHelper?: YardageHelperFields } = {};
  const put = (key: 'fabricName' | 'mill' | 'pattern' | 'shipTo' | 'sidemark' | 'notes') => {
    const value = form[key].trim();
    if (value) spec[key] = value;
  };
  put('fabricName');
  put('mill');
  put('pattern');
  if (yardage) spec.yardage = yardage;
  spec.railroaded = form.railroaded;
  put('shipTo');
  put('sidemark');
  const weeks = numberOrNull(form.secondLeadTimeWeeks);
  if (weeks !== null) spec.secondLeadTimeWeeks = Math.round(weeks);
  put('notes');
  const helper: YardageHelperFields = {
    chartYards: numberOrNull(form.chartYards),
    widthIn: numberOrNull(form.widthIn),
    repeatIn: numberOrNull(form.repeatIn),
    workroomYards: numberOrNull(form.workroomYards),
  };
  if (Object.values(helper).some((v) => v !== null)) spec.yardageHelper = helper;
  return spec;
}

/** The helper's arithmetic, every step shown. */
export function YardageWorking({ input }: { input: YardageInput }) {
  const reading = readYardage(input);
  if (!reading) {
    return <CellSub>Enter the maker&rsquo;s chart yards, or the workroom&rsquo;s figure.</CellSub>;
  }
  return (
    <div data-testid="com-yardage" className="mt-1">
      <table className="w-full text-[11px] text-[var(--color-charcoal)]">
        <tbody>
          {reading.steps.map((step, i) => (
            <tr key={step.label}>
              <td className="py-0.5 pr-3">{step.label}</td>
              <td className="py-0.5 text-right tabular-nums">
                {i === 0 ? '' : '+ '}
                {formatTenths(step.tenths)} yd
              </td>
            </tr>
          ))}
          <tr className="border-t border-[var(--color-pearl)]">
            <td className="py-0.5 pr-3">
              = {formatTenths(reading.totalTenths)} yd · order
            </td>
            <td className="py-0.5 text-right font-medium tabular-nums">{reading.orderYards} yd</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-[var(--color-charcoal)]">{reading.sentence}</p>
    </div>
  );
}

function ComFacts({ spec }: { spec: unknown }) {
  const form = formFromSpec(spec);
  const facts = [
    [form.fabricName, form.mill, form.pattern].filter(Boolean).join(' · '),
    isRecord(spec) && text(spec.yardage) ? `${text(spec.yardage)} yd${form.railroaded ? ', railroaded' : ''}` : '',
    form.shipTo ? `ships to ${form.shipTo}` : '',
    form.sidemark ? `tagged ${form.sidemark}` : '',
    form.secondLeadTimeWeeks ? `second lead time ${form.secondLeadTimeWeeks} wk` : '',
  ].filter(Boolean);
  return <CellSub>{facts.length > 0 ? facts.join(' · ') : 'No COM facts recorded'}</CellSub>;
}

const FIELDS: { key: Exclude<keyof ComForm, 'railroaded'>; label: string; width?: string; numeric?: boolean }[] = [
  { key: 'fabricName', label: 'Fabric' },
  { key: 'mill', label: 'Mill' },
  { key: 'pattern', label: 'Pattern' },
  { key: 'shipTo', label: 'Ship to' },
  { key: 'sidemark', label: 'Sidemark' },
  { key: 'secondLeadTimeWeeks', label: 'Second lead time (wk)', width: 'w-12', numeric: true },
];

const HELPER_FIELDS: { key: 'chartYards' | 'widthIn' | 'repeatIn' | 'workroomYards'; label: string }[] = [
  { key: 'chartYards', label: 'Chart yd' },
  { key: 'widthIn', label: 'Width in' },
  { key: 'repeatIn', label: 'Repeat in' },
  { key: 'workroomYards', label: "Workroom's yd" },
];

/** The COM spec form: com_details' keys, the yardage helper, one save. */
function ComSpecForm({
  projectId,
  itemId,
  workroomName,
  canEdit,
}: {
  projectId: string;
  itemId: string;
  workroomName: string | null;
  canEdit: boolean;
}) {
  const { data: row, isLoading } = useFfeComSpec(projectId, itemId);
  const update = useUpdateFfeComSpec();
  const [form, setForm] = useState<ComForm>(() => formFromSpec(null));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const loadedVersion = useRef<number | null>(null);
  useEffect(() => {
    if (!row || loadedVersion.current === row.row_version) return;
    loadedVersion.current = row.row_version;
    setForm(formFromSpec(row.com_spec));
  }, [row]);

  if (isLoading) return <CellSub>Reading the COM facts…</CellSub>;
  if (!row) return null;
  if (!canEdit) return <ComFacts spec={row.com_spec} />;

  const input: YardageInput = {
    chartYards: numberOrNull(form.chartYards),
    widthIn: numberOrNull(form.widthIn),
    repeatIn: numberOrNull(form.repeatIn),
    railroaded: form.railroaded,
    workroomYards: numberOrNull(form.workroomYards),
    workroomName,
  };
  const reading = readYardage(input);
  const stored = isRecord(row.com_spec) ? text(row.com_spec.yardage) : '';
  const yardage = reading ? String(reading.orderYards) : stored || null;

  const set = (key: keyof ComForm, value: string | boolean) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const save = () => {
    setError(null);
    update
      .mutateAsync({
        projectId,
        specId: row.id,
        expectedRowVersion: row.row_version,
        comSpec: specFromForm(form, yardage),
      })
      .then(() => setSaved(true))
      .catch((e: Error) => setError(e.message || 'The COM facts were not saved.'));
  };

  return (
    <div data-testid="com-spec" className="mt-2 flex flex-col gap-1.5">
      <p className={LABEL_CLS}>The fabric · COM</p>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex min-w-0 items-baseline gap-1.5">
            <span className={`${LABEL_CLS} shrink-0`}>{f.label}</span>
            <input
              aria-label={f.label}
              value={form[f.key]}
              inputMode={f.numeric ? 'numeric' : undefined}
              placeholder={f.key === 'shipTo' && workroomName ? workroomName : undefined}
              disabled={update.isPending}
              onChange={(e) => set(f.key, e.target.value)}
              className={`${f.width ?? 'min-w-0 flex-1'} ${FIELD_CLS}`}
            />
          </label>
        ))}
      </div>
      <p className={`${LABEL_CLS} mt-1`}>Yardage</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {HELPER_FIELDS.map((f) => (
          <label key={f.key} className="flex items-baseline gap-1.5">
            <span className={LABEL_CLS}>{f.key === 'workroomYards' && workroomName ? `${workroomName}'s yd` : f.label}</span>
            <input
              aria-label={f.key === 'workroomYards' ? "Workroom's yards" : f.label}
              inputMode="decimal"
              value={form[f.key]}
              disabled={update.isPending}
              onChange={(e) => set(f.key, e.target.value)}
              className={`w-12 ${FIELD_CLS}`}
            />
          </label>
        ))}
        <label className="flex items-baseline gap-1.5">
          <input
            type="checkbox"
            checked={form.railroaded}
            disabled={update.isPending}
            onChange={(e) => set('railroaded', e.target.checked)}
          />
          <span className={LABEL_CLS}>Railroaded</span>
        </label>
      </div>
      <YardageWorking input={input} />
      <div className="flex flex-wrap items-baseline gap-x-3">
        <DocumentAction
          actionKey="save-com-spec"
          surfaceKey="project"
          regionKey="ffe-com"
          variant="secondary"
          loading={update.isPending}
          onClick={save}
        >
          Save the COM
        </DocumentAction>
        {saved && !update.isPending && (
          <span aria-live="polite" className="text-[11px] text-[var(--text-muted)]">
            Saved
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── The pair, in the buy cell ─────────────────────────────────────────────

function LinkFabric({
  item,
  projectId,
  candidates,
  onDone,
}: {
  item: FFERow;
  projectId: string;
  candidates: FfePairLine[];
  onDone: () => void;
}) {
  const addFabric = useAddComFabricLine();
  const link = useLinkFfePair({ errorSurface: 'inline' });
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = addFabric.isPending || link.isPending;

  const run = (work: Promise<unknown>) => {
    setError(null);
    work.then(onDone).catch((e: Error) => setError(e.message || 'The fabric was not linked.'));
  };

  return (
    <div data-testid="com-link-fabric" className="mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <DocumentAction
          actionKey="add-com-fabric-line"
          surfaceKey="project"
          regionKey="ffe-com"
          variant="secondary"
          loading={addFabric.isPending}
          disabled={pending}
          onClick={() => run(addFabric.add(projectId, item))}
        >
          Add the fabric line
        </DocumentAction>
        {candidates.length > 0 && (
          <>
            <select
              aria-label="Link a fabric line"
              value={choice}
              disabled={pending}
              onChange={(e) => setChoice(e.target.value)}
              className={FIELD_CLS}
            >
              <option value="">or link a line…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <DocumentAction
              actionKey="link-com-fabric-line"
              surfaceKey="project"
              regionKey="ffe-com"
              variant="tertiary"
              disabled={pending || !choice}
              onClick={() => run(link.mutateAsync({ childId: choice, parentId: item.id }))}
            >
              Link
            </DocumentAction>
          </>
        )}
        <DocumentAction
          actionKey="cancel-com-pair"
          surfaceKey="project"
          regionKey="ffe-com"
          variant="tertiary"
          disabled={pending}
          onClick={onDone}
        >
          Put back
        </DocumentAction>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The pair in "The buy" cell. A fabric line names its piece; a piece names
 * its fabric and carries the COM facts; a line in no pair offers "This piece
 * takes COM". Every line carries its submittals.
 */
export function ComPiece({
  item,
  projectId,
  canEdit,
}: {
  item: FFERow;
  projectId: string;
  canEdit: boolean;
}) {
  const { data: lines } = useFfePairLines(projectId);
  const link = useLinkFfePair({ errorSurface: 'inline' });
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pair = readPair(item, lines ?? []);
  const unlink = (childId: string) => {
    setError(null);
    link
      .mutateAsync({ childId, parentId: null })
      .catch((e: Error) => setError(e.message || 'The pair was not unlinked.'));
  };
  const unlinkAct = (childId: string) =>
    canEdit && (
      <DocumentAction
        actionKey="unlink-com-pair"
        surfaceKey="project"
        regionKey="ffe-com"
        variant="tertiary"
        disabled={link.isPending}
        onClick={() => unlink(childId)}
      >
        Unlink
      </DocumentAction>
    );

  const takesCom = pair.children.length > 0;
  return (
    <div data-testid="com-piece" className="mt-2">
      {pair.parent && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-[var(--color-charcoal)]">
          <span>
            COM fabric for <span className="font-medium">{pair.parent.name}</span>
            {pair.parent.vendor_name ? `, shipped to ${pair.parent.vendor_name}` : ''}
          </span>
          {unlinkAct(item.id)}
        </p>
      )}
      {takesCom &&
        pair.children.map((child) => (
          <p key={child.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-[var(--color-charcoal)]">
            <span>
              Takes COM · <span className="font-medium">{child.name}</span>
              {child.vendor_name ? ` from ${child.vendor_name}` : ''}
            </span>
            {unlinkAct(child.id)}
          </p>
        ))}
      {!pair.onPiece && !takesCom && canEdit && lines && !linking && (
        <DocumentAction
          actionKey="piece-takes-com"
          surfaceKey="project"
          regionKey="ffe-com"
          variant="tertiary"
          onClick={() => setLinking(true)}
        >
          This piece takes COM
        </DocumentAction>
      )}
      {linking && !takesCom && (
        <LinkFabric
          item={item}
          projectId={projectId}
          candidates={pair.candidates}
          onDone={() => setLinking(false)}
        />
      )}
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}
      {takesCom && (
        <ComSpecForm
          projectId={projectId}
          itemId={item.id}
          workroomName={item.vendor_name ?? null}
          canEdit={canEdit}
        />
      )}
      <LineSubmittals
        projectId={projectId}
        itemId={item.id}
        canEdit={canEdit}
        defaultKind={pair.parent ? 'cfa' : 'shop_drawing'}
      />
    </div>
  );
}
