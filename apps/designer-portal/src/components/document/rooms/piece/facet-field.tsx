'use client';

/**
 * The Piece Room's self-saving field primitives (R40 grammar). Each field holds
 * a local value, writes ONE column on blur (text/number/money/dimensions) or
 * immediately (chips/select), and shows a quiet per-field status — saving… / a
 * fading ✓ / a recoverable error. Zero shadows (D4); the grammar matches
 * ComposeField exactly so the Piece Room reads like Compose and Drafting.
 *
 * In read-only mode (a catalog row a designer can't edit) every field renders as
 * static type, never a greyed input — the page becomes a specimen sheet.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVendors } from '@patina/supabase';
import { usePieceField, type PieceFieldUpdate } from '@/hooks/use-piece-field';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** One save channel per field — its own mutation + transient status. */
function useFacetSave(productId: string) {
  const mutation = usePieceField(productId);
  const [state, setState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const save = useCallback(
    async (updates: PieceFieldUpdate) => {
      setState('saving');
      setErrorMsg(null);
      try {
        await mutation.mutateAsync(updates);
        setState('saved');
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState('idle'), 1800);
      } catch (e) {
        setState('error');
        setErrorMsg(e instanceof Error ? e.message : 'Could not save just now.');
      }
    },
    [mutation],
  );

  return { save, state, errorMsg };
}

/** Re-seed local state from the server when it changes — but never clobber an
 *  edit in progress (the field is focused). */
function useSyncedValue<T>(serverValue: T) {
  const [value, setValue] = useState<T>(serverValue);
  const focused = useRef(false);
  const lastServer = useRef<T>(serverValue);
  useEffect(() => {
    if (serverValue !== lastServer.current) {
      lastServer.current = serverValue;
      if (!focused.current) setValue(serverValue);
    }
  }, [serverValue]);
  return { value, setValue, focused };
}

function FacetLabel({ children, needed }: { children: React.ReactNode; needed?: boolean }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
      {children}
      {needed && (
        <span className="rounded-[3px] bg-[rgba(196,165,123,0.14)] px-1 py-px text-[0.42rem] tracking-[0.06em] text-[var(--color-clay-ink)]">
          studio needs
        </span>
      )}
    </span>
  );
}

function SaveDot({ state, errorMsg }: { state: SaveState; errorMsg: string | null }) {
  if (state === 'idle') return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={`ml-2 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.06em] ${
        state === 'error' ? 'text-[var(--color-terracotta-ink)]' : 'text-[var(--color-sage)]'
      }`}
    >
      {state === 'saving' && '· saving…'}
      {state === 'saved' && '✓ saved'}
      {state === 'error' && `· ${errorMsg ?? "couldn't save"}`}
    </span>
  );
}

const INPUT_CLS =
  'w-full rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:bg-white focus:outline-none disabled:opacity-50';

/** Static value rendering used by every read-only field. */
function StaticValue({ children, empty }: { children?: React.ReactNode; empty?: string }) {
  const isEmpty = children == null || children === '' || (Array.isArray(children) && children.length === 0);
  return (
    <p
      className={`text-[0.86rem] leading-relaxed ${
        isEmpty ? 'italic text-[var(--color-aged-oak)] opacity-70' : 'text-[var(--color-charcoal)]'
      }`}
    >
      {isEmpty ? (empty ?? 'not on file') : children}
    </p>
  );
}

// ── Text (single-line) ─────────────────────────────────────────────────────
export function FacetText({
  productId,
  column,
  serverValue,
  label,
  placeholder,
  readOnly,
  needed,
}: {
  productId: string;
  column: string;
  serverValue: string | null;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  needed?: boolean;
}) {
  const { value, setValue, focused } = useSyncedValue(serverValue ?? '');
  const { save, state, errorMsg } = useFacetSave(productId);

  if (readOnly) {
    return (
      <label className="mt-3 block">
        <FacetLabel>{label}</FacetLabel>
        <StaticValue>{serverValue || undefined}</StaticValue>
      </label>
    );
  }

  const commit = () => {
    focused.current = false;
    const next = value.trim();
    if (next !== (serverValue ?? '').trim()) {
      void save({ [column]: next || null });
    }
  };

  return (
    <label className="mt-3 block">
      <FacetLabel needed={needed}>
        {label}
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={commitKeys}
        disabled={state === 'saving'}
        className={INPUT_CLS}
      />
    </label>
  );
}

/** Enter and Escape both commit the field (blur fires the save). Escape also
 *  stops propagation so it doesn't bubble to RoomShell and leave the Room
 *  mid-edit. */
function commitKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    e.currentTarget.blur();
  }
}

// ── Textarea (multi-line) ───────────────────────────────────────────────────
export function FacetTextarea({
  productId,
  column,
  serverValue,
  label,
  placeholder,
  readOnly,
  needed,
  rows = 3,
}: {
  productId: string;
  column: string;
  serverValue: string | null;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  needed?: boolean;
  rows?: number;
}) {
  const { value, setValue, focused } = useSyncedValue(serverValue ?? '');
  const { save, state, errorMsg } = useFacetSave(productId);

  if (readOnly) {
    return (
      <label className="mt-3 block">
        <FacetLabel>{label}</FacetLabel>
        <StaticValue>{serverValue || undefined}</StaticValue>
      </label>
    );
  }

  const commit = () => {
    focused.current = false;
    const next = value.trim();
    if (next !== (serverValue ?? '').trim()) void save({ [column]: next || null });
  };

  return (
    <label className="mt-3 block">
      <FacetLabel needed={needed}>
        {label}
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
        disabled={state === 'saving'}
        className={`${INPUT_CLS} resize-y leading-relaxed`}
      />
    </label>
  );
}

// ── Number ──────────────────────────────────────────────────────────────────
export function FacetNumber({
  productId,
  column,
  serverValue,
  label,
  placeholder,
  suffix,
  readOnly,
  needed,
  step,
  min,
  max,
}: {
  productId: string;
  column: string;
  serverValue: number | null;
  label: string;
  placeholder?: string;
  suffix?: string;
  readOnly?: boolean;
  needed?: boolean;
  step?: string;
  min?: number;
  max?: number;
}) {
  const { value, setValue, focused } = useSyncedValue(serverValue == null ? '' : String(serverValue));
  const { save, state, errorMsg } = useFacetSave(productId);

  if (readOnly) {
    return (
      <label className="mt-3 block">
        <FacetLabel>{label}</FacetLabel>
        <StaticValue>{serverValue == null ? undefined : `${serverValue}${suffix ? ` ${suffix}` : ''}`}</StaticValue>
      </label>
    );
  }

  const commit = () => {
    focused.current = false;
    const raw = value.trim();
    if (raw === '') {
      if (serverValue !== null) void save({ [column]: null });
      return;
    }
    let next = Number(raw);
    if (!Number.isFinite(next)) return;
    // Clamp to the column's domain so an out-of-range value (e.g. a
    // NUMERIC(4,2) commission ≥ 100) never reaches the DB as a raw error.
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    if (String(next) !== value) setValue(String(next));
    if (next !== serverValue) void save({ [column]: next });
  };

  return (
    <label className="mt-3 block">
      <FacetLabel needed={needed}>
        {label}
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          placeholder={placeholder}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={commitKeys}
          disabled={state === 'saving'}
          className={INPUT_CLS}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[0.62rem] text-[var(--color-aged-oak)]">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

// ── Money (dollars in, cents stored) ────────────────────────────────────────
export function FacetMoney({
  productId,
  column,
  serverCents,
  label,
  placeholder,
  readOnly,
  needed,
  note,
}: {
  productId: string;
  column: string;
  serverCents: number | null;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  needed?: boolean;
  note?: string;
}) {
  const serverDollars = serverCents == null ? '' : String(serverCents / 100);
  const { value, setValue, focused } = useSyncedValue(serverDollars);
  const { save, state, errorMsg } = useFacetSave(productId);

  if (readOnly) {
    return (
      <label className="mt-3 block">
        <FacetLabel>{label}</FacetLabel>
        <StaticValue>
          {serverCents == null
            ? undefined
            : (serverCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </StaticValue>
      </label>
    );
  }

  const commit = () => {
    focused.current = false;
    const raw = value.replace(/[^0-9.]/g, '').trim();
    const dollars = raw === '' ? null : Number(raw);
    if (dollars !== null && !Number.isFinite(dollars)) return;
    const cents = dollars === null ? null : Math.round(dollars * 100);
    if (cents !== serverCents) void save({ [column]: cents });
  };

  return (
    <label className="mt-3 block">
      <FacetLabel needed={needed}>
        {label}
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.82rem] text-[var(--color-aged-oak)]">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={commitKeys}
          disabled={state === 'saving'}
          className={`${INPUT_CLS} pl-7`}
        />
      </div>
      {note && <span className="mt-1 block text-[0.66rem] italic text-[var(--color-aged-oak)]">{note}</span>}
    </label>
  );
}

// ── Select (enum) — saves on change ─────────────────────────────────────────
export function FacetSelect({
  productId,
  column,
  serverValue,
  label,
  options,
  readOnly,
  needed,
  required,
  placeholder = 'Choose…',
}: {
  productId: string;
  column: string;
  serverValue: string | null;
  label: string;
  options: { value: string; label: string }[];
  readOnly?: boolean;
  needed?: boolean;
  /** A NOT NULL column — never offer an empty option (would write null). */
  required?: boolean;
  placeholder?: string;
}) {
  const { save, state, errorMsg } = useFacetSave(productId);

  // Preserve an out-of-vocabulary value (e.g. a `category` not in our list) so
  // it round-trips and is never silently blanked.
  const opts =
    serverValue && !options.some((o) => o.value === serverValue)
      ? [...options, { value: serverValue, label: serverValue }]
      : options;

  if (readOnly) {
    const match = opts.find((o) => o.value === serverValue);
    return (
      <label className="mt-3 block">
        <FacetLabel>{label}</FacetLabel>
        <StaticValue>{match?.label ?? serverValue ?? undefined}</StaticValue>
      </label>
    );
  }

  return (
    <label className="mt-3 block">
      <FacetLabel needed={needed}>
        {label}
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <select
        value={serverValue ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          // A required column must never be set to null by the placeholder.
          if (required && v === '') return;
          void save({ [column]: v || null });
        }}
        disabled={state === 'saving'}
        className={INPUT_CLS}
      >
        {!required && <option value="">{placeholder}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Chips (string[] column) — add/remove save immediately ───────────────────
export function FacetChips({
  productId,
  column,
  serverValue,
  label,
  placeholder = 'type and press Enter',
  readOnly,
  needed,
  swatch,
}: {
  productId: string;
  column: string;
  serverValue: string[] | null;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  needed?: boolean;
  /** render a color swatch before each chip (colors fields) */
  swatch?: boolean;
}) {
  const values = serverValue ?? [];
  const [draft, setDraft] = useState('');
  const { save, state, errorMsg } = useFacetSave(productId);

  if (readOnly) {
    return (
      <div className="mt-3">
        <FacetLabel>{label}</FacetLabel>
        {values.length === 0 ? (
          <StaticValue empty="none on file" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {values.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1.5 rounded-[14px] border border-[var(--color-pearl)] px-2.5 py-1 text-[0.72rem] text-[var(--color-mocha)]"
              >
                {swatch && <Swatch value={v} />}
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) {
      setDraft('');
      return;
    }
    setDraft('');
    void save({ [column]: [...values, v] });
  };
  const remove = (v: string) => void save({ [column]: values.filter((x) => x !== v) });

  return (
    <div className="mt-3">
      <FacetLabel needed={needed}>
        {label}
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 rounded-[14px] border border-[var(--color-pearl)] bg-white py-1 pl-2.5 pr-1.5 text-[0.72rem] text-[var(--color-mocha)]"
          >
            {swatch && <Swatch value={v} />}
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => remove(v)}
              className="text-[var(--color-aged-oak)] hover:text-[var(--color-terracotta-ink)]"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft('');
              e.currentTarget.blur();
            }
          }}
          onBlur={add}
          className="min-w-[140px] flex-1 rounded-[6px] border border-dashed border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-1 text-[0.74rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:bg-white focus:outline-none"
        />
      </div>
    </div>
  );
}

/** A best-effort color swatch — renders the chip's text as a CSS color if it is
 *  a recognizable one, else a neutral dot. Decorative only. */
function Swatch({ value }: { value: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-pearl)]"
      style={{ background: cssColorOrNeutral(value) }}
    />
  );
}
function cssColorOrNeutral(name: string): string {
  if (typeof document === 'undefined') return 'var(--color-pearl)';
  const probe = new Option().style;
  probe.color = '';
  probe.color = name.trim().toLowerCase().replace(/\s+/g, '');
  return probe.color !== '' ? probe.color : 'var(--color-pearl)';
}

// ── Dimensions (JSONB { width, depth, height, unit }) ───────────────────────
type Dim = { width?: string; depth?: string; height?: string; unit?: string };

export function FacetDimensions({
  productId,
  serverValue,
  readOnly,
}: {
  productId: string;
  serverValue: unknown;
  readOnly?: boolean;
}) {
  const seed = normalizeDim(serverValue);
  const [dim, setDim] = useState<Dim>(seed);
  const lastServer = useRef(JSON.stringify(seed));
  const { save, state, errorMsg } = useFacetSave(productId);

  useEffect(() => {
    const incoming = normalizeDim(serverValue);
    const key = JSON.stringify(incoming);
    if (key !== lastServer.current) {
      lastServer.current = key;
      setDim(incoming);
    }
  }, [serverValue]);

  if (readOnly) {
    const has = seed.width || seed.depth || seed.height;
    return (
      <div className="mt-3">
        <FacetLabel>Dimensions</FacetLabel>
        <StaticValue empty="not yet measured">
          {has ? `${seed.width || '—'} × ${seed.depth || '—'} × ${seed.height || '—'} ${seed.unit ?? 'in'}` : undefined}
        </StaticValue>
      </div>
    );
  }

  const commit = (next: Dim) => {
    const anyVal = next.width || next.depth || next.height;
    const payload = anyVal ? next : null;
    // Skip a no-op blur — never re-PATCH unchanged dimensions (and never trip a
    // studio-needs error on an already-empty field).
    if (JSON.stringify(normalizeDim(payload)) === lastServer.current) return;
    void save({ dimensions: payload });
  };
  const set = (k: keyof Dim, v: string) => setDim((p) => ({ ...p, [k]: v }));

  return (
    <div className="mt-3">
      <FacetLabel>
        Dimensions
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <div className="flex items-end gap-2">
        {(['width', 'depth', 'height'] as const).map((k) => (
          <label key={k} className="flex-1">
            <span className="mb-1 block text-center font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              {k}
            </span>
            <input
              value={dim[k] ?? ''}
              placeholder={k === 'width' ? '72"' : k === 'depth' ? '38"' : '30"'}
              onChange={(e) => set(k, e.target.value)}
              onBlur={() => commit(dim)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  e.currentTarget.blur();
                }
              }}
              disabled={state === 'saving'}
              className={`${INPUT_CLS} text-center`}
            />
          </label>
        ))}
        <select
          value={dim.unit ?? 'in'}
          onChange={(e) => {
            const next = { ...dim, unit: e.target.value };
            setDim(next);
            commit(next);
          }}
          disabled={state === 'saving'}
          className="rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-2 text-[0.74rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
        >
          <option value="in">in</option>
          <option value="cm">cm</option>
        </select>
      </div>
    </div>
  );
}

function normalizeDim(raw: unknown): Dim {
  if (!raw || typeof raw !== 'object') return { unit: 'in' };
  const d = raw as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? '' : String(v));
  return {
    width: str(d.width),
    depth: str(d.depth),
    height: str(d.height),
    unit: typeof d.unit === 'string' ? d.unit : 'in',
  };
}

// ── Vendor contact (JSONB { name, email, phone }) ───────────────────────────
type Contact = { name?: string; email?: string; phone?: string };

export function FacetVendorContact({
  productId,
  serverValue,
  readOnly,
  needed,
}: {
  productId: string;
  serverValue: unknown;
  readOnly?: boolean;
  needed?: boolean;
}) {
  const seed = normalizeContact(serverValue);
  const [contact, setContact] = useState<Contact>(seed);
  const lastServer = useRef(JSON.stringify(seed));
  const { save, state, errorMsg } = useFacetSave(productId);

  useEffect(() => {
    const incoming = normalizeContact(serverValue);
    const key = JSON.stringify(incoming);
    if (key !== lastServer.current) {
      lastServer.current = key;
      setContact(incoming);
    }
  }, [serverValue]);

  if (readOnly) {
    const has = seed.name || seed.email || seed.phone;
    return (
      <div className="mt-3">
        <FacetLabel>Maker contact</FacetLabel>
        {has ? (
          <div className="text-[0.82rem] leading-relaxed text-[var(--color-charcoal)]">
            {seed.name && <div>{seed.name}</div>}
            {seed.email && <div className="text-[var(--color-aged-oak)]">{seed.email}</div>}
            {seed.phone && <div className="text-[var(--color-aged-oak)]">{seed.phone}</div>}
          </div>
        ) : (
          <StaticValue empty="no contact on file" />
        )}
      </div>
    );
  }

  const commit = () => {
    const anyVal = contact.name || contact.email || contact.phone;
    const payload = anyVal ? contact : null;
    // Skip a no-op blur — never re-PATCH unchanged contact.
    if (JSON.stringify(normalizeContact(payload)) === lastServer.current) return;
    void save({ vendor_contact: payload });
  };

  return (
    <div className="mt-3">
      <FacetLabel needed={needed}>
        Maker contact
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      <div className="flex flex-col gap-2">
        {(['name', 'email', 'phone'] as const).map((k) => (
          <input
            key={k}
            value={contact[k] ?? ''}
            placeholder={k === 'name' ? 'contact name' : k === 'email' ? 'email' : 'phone'}
            type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
            onChange={(e) => setContact((p) => ({ ...p, [k]: e.target.value }))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            disabled={state === 'saving'}
            className={INPUT_CLS}
          />
        ))}
      </div>
    </div>
  );
}

function normalizeContact(raw: unknown): Contact {
  if (!raw || typeof raw !== 'object') return {};
  const c = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  return { name: str(c.name), email: str(c.email), phone: str(c.phone) };
}

// ── Vendor picker (vendor_id / retailer_id) — a paper typeahead ─────────────
export function FacetVendorPicker({
  productId,
  column,
  label,
  currentVendorId,
  currentVendorName,
  readOnly,
  needed,
}: {
  productId: string;
  column: 'vendor_id' | 'retailer_id';
  label: string;
  currentVendorId: string | null;
  currentVendorName: string | null;
  readOnly?: boolean;
  needed?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The joined vendor object isn't part of the optimistic ['product', id] write
  // (only the id is), so hold the picked label locally to show it immediately.
  const [justPicked, setJustPicked] = useState<{ id: string; name: string } | null>(null);
  const { save, state, errorMsg } = useFacetSave(productId);
  const { data } = useVendors(search ? { search } : undefined, { page: 1, pageSize: 8 });
  const vendors = ((data as { data?: Array<{ id: string; name: string }> } | undefined)?.data ?? []) as Array<{
    id: string;
    name: string;
  }>;

  const displayName = justPicked && justPicked.id === currentVendorId ? justPicked.name : currentVendorName;

  if (readOnly) {
    return (
      <label className="mt-3 block">
        <FacetLabel>{label}</FacetLabel>
        <StaticValue>{displayName || undefined}</StaticValue>
      </label>
    );
  }

  const choose = (v: { id: string; name: string }) => {
    setJustPicked(v);
    setOpen(false);
    setSearch('');
    setActive(0);
    if (v.id !== currentVendorId) void save({ [column]: v.id });
  };
  const clear = () => {
    setJustPicked(null);
    if (currentVendorId) void save({ [column]: null });
  };

  const listId = `vp-${column}-${productId}`;
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!open || vendors.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(vendors.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = vendors[active];
      if (v) choose(v);
    }
  };

  return (
    <div
      className="mt-3"
      onBlur={(e) => {
        // Close only when focus leaves the whole picker (not when moving between
        // its own controls) — replaces the blur timeout, keyboard-safe.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <FacetLabel needed={needed}>
        {label}
        <SaveDot state={state} errorMsg={errorMsg} />
      </FacetLabel>
      {currentVendorId && !open ? (
        <div className="flex items-center justify-between rounded-[6px] border border-[var(--color-pearl)] bg-white px-3 py-2">
          <span className="text-[0.82rem] text-[var(--color-charcoal)]">{displayName ?? 'Selected'}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setActive(0);
              }}
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay-ink)] hover:text-[var(--color-aged-oak)]"
            >
              Change
            </button>
            <button
              type="button"
              onClick={clear}
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:text-[var(--color-terracotta-ink)]"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <input
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && vendors[active] ? `${listId}-${active}` : undefined}
            value={search}
            placeholder="Search makers…"
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            disabled={state === 'saving'}
            className={INPUT_CLS}
          />
          {open && search.trim() !== '' && (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-10 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[6px] border border-[var(--color-pearl)] bg-white py-1"
            >
              {vendors.length === 0 ? (
                <li className="px-3 py-1.5 text-[0.74rem] italic text-[var(--color-aged-oak)]">No makers match.</li>
              ) : (
                vendors.map((v, i) => (
                  <li key={v.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(v)}
                      className={`block w-full px-3 py-1.5 text-left text-[0.8rem] text-[var(--color-mocha)] hover:bg-[var(--doc-sheet-2)] ${
                        i === active ? 'bg-[var(--doc-sheet-2)]' : ''
                      }`}
                    >
                      {v.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
