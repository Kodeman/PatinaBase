/**
 * Region A — the Record. The extracted product fields with per-field
 * verified/edited/missing badges, inline-editable. The hero image opens the C3
 * curation sheet; tapping a field marks it edited.
 */
import { useState } from 'react';
import { useCapture, useDraft, useCaptureDispatch } from '../../state/CaptureProvider';
import { FieldBadge } from '../FieldBadge';
import { runOcr } from '../../lib/ocr';

function OcrTrigger({ imageUrl }: { imageUrl: string }) {
  const dispatch = useCaptureDispatch();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const read = async () => {
    setBusy(true);
    setDone(null);
    const fields = await runOcr(imageUrl);
    setBusy(false);
    if (!fields) {
      setDone('No text read');
      return;
    }
    if (fields.name) dispatch({ type: 'FIELD_EDIT', field: 'name', value: fields.name });
    if (fields.price)
      dispatch({ type: 'FIELD_EDIT', field: 'price', value: (fields.price.value / 100).toFixed(2) });
    if (fields.materials?.length)
      dispatch({ type: 'FIELD_EDIT', field: 'materials', value: fields.materials });
    setDone('Filled from image');
  };

  return (
    <button
      type="button"
      onClick={read}
      disabled={busy}
      className="w-full rounded-md border border-line py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.08em] text-ink-soft transition-colors hover:border-verdigris hover:text-verdigris disabled:opacity-50"
    >
      {busy ? 'Reading image…' : (done ?? 'Read text from image')}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-soft">
      {children}
    </span>
  );
}

export function RecordRegion() {
  const draft = useDraft();
  const { prefs } = useCapture();
  const dispatch = useCaptureDispatch();
  if (!draft) return null;

  const f = draft.fields;
  const hero = draft.images.selected.map((i) => draft.images.all[i])[0] ?? draft.images.all[0];
  const ocrEligible =
    prefs.ocrEnabled &&
    !!hero &&
    (draft.captureKind === 'snapshot' || draft.captureKind === 'image');
  const vendorName = draft.manufacturer.vendor?.name ?? draft.retailer.vendor?.name ?? null;

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

      {ocrEligible && hero && <OcrTrigger imageUrl={hero.url} />}

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
