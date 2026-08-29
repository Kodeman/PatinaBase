/**
 * Region A — the Record. The extracted product fields with per-field
 * verified/edited/missing badges, inline-editable. The hero image opens the C3
 * curation sheet; tapping a field marks it edited.
 */
import { useRef, useState } from 'react';
import { useDraft, useCaptureDispatch } from '../../state/CaptureProvider';
import { FieldBadge } from '../FieldBadge';
import type { EditableDimensions } from '../../state/types';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-soft">
      {children}
    </span>
  );
}

function AddFieldButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-verdigris hover:text-verdigris-2"
    >
      + {label}
    </button>
  );
}

function DimInput({
  label,
  value,
  onChange,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      aria-label={label}
      value={value}
      inputMode="decimal"
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      className="w-full min-w-0 bg-transparent font-mono text-[0.8rem] text-ink outline-none placeholder:text-ink-soft/50 border-b border-line/60 focus:border-line"
    />
  );
}

/** Dimension keys minus 'unit', which is edited separately via a <select>. */
type DimKey = Exclude<keyof EditableDimensions, 'unit'>;

const DIM_LABELS: Record<DimKey, string> = {
  width: 'Width',
  height: 'Height',
  depth: 'Depth',
  seatHeight: 'Seat height',
  seatDepth: 'Seat depth',
  seatWidth: 'Seat width',
  armHeight: 'Arm height',
  backHeight: 'Back height',
  legHeight: 'Leg height',
  clearance: 'Clearance',
};

/** Fields carried by EditableDimensions beyond width/height/depth/unit — the "More" disclosure. */
const EXTRA_DIM_FIELDS: DimKey[] = [
  'seatHeight',
  'seatDepth',
  'seatWidth',
  'armHeight',
  'backHeight',
  'legHeight',
  'clearance',
];

const ALL_DIM_KEYS: DimKey[] = ['width', 'height', 'depth', ...EXTRA_DIM_FIELDS];

function hasAnyDimValue(d: EditableDimensions): boolean {
  return ALL_DIM_KEYS.some((k) => d[k] !== '');
}

/** Focus an element on the next frame — used so a freshly-revealed input is
 * actually mounted before we try to focus it. */
function focusSoon(ref: React.RefObject<HTMLInputElement | null>) {
  requestAnimationFrame(() => ref.current?.focus());
}

export function RecordRegion() {
  const draft = useDraft();
  const dispatch = useCaptureDispatch();
  const initialDims = draft?.fields.dimensions.value;
  const [dimsOpen, setDimsOpen] = useState(false);
  const [dimsExpanded, setDimsExpanded] = useState(() =>
    initialDims ? EXTRA_DIM_FIELDS.some((k) => initialDims[k] !== '') : false
  );
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialInput, setMaterialInput] = useState('');
  const [finishOpen, setFinishOpen] = useState(false);
  const widthInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const finishInputRef = useRef<HTMLInputElement>(null);
  if (!draft) return null;

  const f = draft.fields;
  const hero = draft.images.selected.map((i) => draft.images.all[i])[0] ?? draft.images.all[0];
  const vendorName = draft.manufacturer.vendor?.name ?? draft.retailer.vendor?.name ?? null;

  const dims = f.dimensions.value;
  // Sticky once opened — clearing a value (or removing the last chip) must
  // never unmount the input the person is actively editing.
  const showDims = dimsOpen || hasAnyDimValue(dims);
  const showMaterials = materialsOpen || f.materials.value.length > 0;
  const showFinish = finishOpen || !!f.finish.value;
  const populatedExtrasCount = EXTRA_DIM_FIELDS.filter((k) => dims[k] !== '').length;

  function updateDim(key: DimKey, value: string) {
    setDimsOpen(true);
    dispatch({ type: 'FIELD_EDIT', field: 'dimensions', value: { ...dims, [key]: value } });
  }

  function updateDimUnit(unit: EditableDimensions['unit']) {
    setDimsOpen(true);
    dispatch({ type: 'FIELD_EDIT', field: 'dimensions', value: { ...dims, unit } });
  }

  function addMaterial() {
    const value = materialInput.trim();
    setMaterialsOpen(true);
    if (!value) return;
    const isDuplicate = f.materials.value.some((m) => m.toLowerCase() === value.toLowerCase());
    setMaterialInput('');
    if (isDuplicate) return;
    dispatch({ type: 'FIELD_EDIT', field: 'materials', value: [...f.materials.value, value] });
  }

  function removeMaterial(index: number) {
    setMaterialsOpen(true);
    dispatch({
      type: 'FIELD_EDIT',
      field: 'materials',
      value: f.materials.value.filter((_, i) => i !== index),
    });
  }

  return (
    <section className="space-y-3">
      {/* Hero image → C3 curation */}
      <button
        type="button"
        onClick={() => dispatch({ type: 'OPEN_OVERLAY', overlay: 'C3' })}
        className="relative block w-full overflow-hidden rounded-md border border-line bg-paper-3 aspect-[4/3]"
        title="Choose images"
      >
        {hero ? (
          <img src={hero.url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="flex h-full items-center justify-center font-mono text-[0.65rem] uppercase tracking-[0.08em] text-ink-soft">
            no image
          </span>
        )}
        {draft.images.all.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-paper bg-ink/70 px-1.5 py-0.5 rounded-sm">
            {draft.images.selected.length}/{draft.images.all.length}
          </span>
        )}
      </button>

      {/* Name */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Name</Label>
          <FieldBadge status={f.name.status} />
        </div>
        <input
          value={f.name.value}
          onChange={(e) => dispatch({ type: 'FIELD_EDIT', field: 'name', value: e.target.value })}
          placeholder="Product name"
          className="w-full bg-transparent font-display text-[1.15rem] leading-tight text-ink outline-none placeholder:text-ink-soft/50 border-b border-transparent focus:border-line"
        />
      </div>

      {/* Price */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Price</Label>
          <FieldBadge status={f.price.status} />
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-ink-soft">$</span>
          <input
            value={f.price.value}
            inputMode="decimal"
            onChange={(e) => dispatch({ type: 'FIELD_EDIT', field: 'price', value: e.target.value })}
            placeholder="0.00"
            className="w-full bg-transparent font-mono text-ink outline-none placeholder:text-ink-soft/50 border-b border-transparent focus:border-line"
          />
        </div>
      </div>

      {/* Brand */}
      {vendorName && (
        <div className="flex items-center justify-between border-t border-line pt-2">
          <Label>Brand</Label>
          <span className="text-[0.85rem] text-ink-2">{vendorName}</span>
        </div>
      )}

      {/* Dimensions */}
      <div className="space-y-1.5 border-t border-line pt-2">
        <div className="flex items-center justify-between">
          <Label>Dimensions</Label>
          <FieldBadge status={f.dimensions.status} />
        </div>
        {showDims ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <DimInput
                label="Width"
                value={dims.width}
                onChange={(v) => updateDim('width', v)}
                inputRef={widthInputRef}
              />
              <span className="font-mono text-[0.7rem] text-ink-soft">×</span>
              <DimInput label="Height" value={dims.height} onChange={(v) => updateDim('height', v)} />
              <span className="font-mono text-[0.7rem] text-ink-soft">×</span>
              <DimInput label="Depth" value={dims.depth} onChange={(v) => updateDim('depth', v)} />
              <select
                aria-label="Unit"
                value={dims.unit}
                onChange={(e) => updateDimUnit(e.target.value as EditableDimensions['unit'])}
                className="shrink-0 bg-transparent font-mono text-[0.7rem] text-ink-soft outline-none border-b border-line/60 focus:border-line"
              >
                <option value="in">in</option>
                <option value="cm">cm</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setDimsExpanded((v) => !v)}
              className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-ink-soft underline decoration-line underline-offset-2"
            >
              {dimsExpanded ? 'Less' : populatedExtrasCount > 0 ? `More (${populatedExtrasCount})` : 'More'}
            </button>
            {dimsExpanded && (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                {EXTRA_DIM_FIELDS.map((key) => (
                  <DimInput
                    key={key}
                    label={DIM_LABELS[key]}
                    value={dims[key]}
                    onChange={(v) => updateDim(key, v)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <AddFieldButton
            label="Add dimensions"
            onClick={() => {
              setDimsOpen(true);
              focusSoon(widthInputRef);
            }}
          />
        )}
      </div>

      {/* Materials */}
      <div className="space-y-1.5 border-t border-line pt-2">
        <div className="flex items-center justify-between">
          <Label>Materials</Label>
          <FieldBadge status={f.materials.status} />
        </div>
        {showMaterials ? (
          <div className="space-y-1.5">
            {f.materials.value.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {f.materials.value.map((m, i) => (
                  <span
                    key={`${m}-${i}`}
                    className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-sm border border-line text-ink-2"
                  >
                    {m}
                    <button
                      type="button"
                      aria-label={`Remove ${m}`}
                      onClick={() => removeMaterial(i)}
                      className="text-ink-soft hover:text-rust"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              ref={materialInputRef}
              aria-label="Add a material"
              value={materialInput}
              onChange={(e) => setMaterialInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMaterial();
                }
              }}
              placeholder="Add a material"
              className="w-full bg-transparent text-[0.85rem] text-ink outline-none placeholder:text-ink-soft/50 border-b border-transparent focus:border-line"
            />
          </div>
        ) : (
          <AddFieldButton
            label="Add materials"
            onClick={() => {
              setMaterialsOpen(true);
              focusSoon(materialInputRef);
            }}
          />
        )}
      </div>

      {/* Finish */}
      <div className="space-y-1.5 border-t border-line pt-2">
        <div className="flex items-center justify-between">
          <Label>Finish</Label>
          <FieldBadge status={f.finish.status} />
        </div>
        {showFinish ? (
          <input
            ref={finishInputRef}
            aria-label="Finish"
            value={f.finish.value}
            onChange={(e) => {
              setFinishOpen(true);
              dispatch({ type: 'FIELD_EDIT', field: 'finish', value: e.target.value });
            }}
            placeholder="Finish"
            className="w-full bg-transparent text-[0.85rem] text-ink outline-none placeholder:text-ink-soft/50 border-b border-transparent focus:border-line"
          />
        ) : (
          <AddFieldButton
            label="Add finish"
            onClick={() => {
              setFinishOpen(true);
              focusSoon(finishInputRef);
            }}
          />
        )}
      </div>

      {/* Description */}
      <div className="space-y-1 border-t border-line pt-2">
        <div className="flex items-center justify-between">
          <Label>Description</Label>
          <FieldBadge status={f.description.status} />
        </div>
        <textarea
          value={f.description.value}
          onChange={(e) => dispatch({ type: 'FIELD_EDIT', field: 'description', value: e.target.value })}
          placeholder="—"
          rows={2}
          className="w-full resize-none bg-transparent text-[0.85rem] text-ink-2 outline-none placeholder:text-ink-soft/50"
        />
      </div>
    </section>
  );
}
