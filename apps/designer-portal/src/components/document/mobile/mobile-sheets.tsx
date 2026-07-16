'use client';

/**
 * The D13 bottom sheets. Paper sheets are document parts (spine, margin item,
 * timer); the drawer is the desk's book list (its six books open the
 * existing charcoal DocSheet ledgers via the open-ledger event — Library,
 * People, and Rooms are Rooms, so the same event walks them in instead). One
 * scrim, scrim-tap dismiss; no shadows (D4). Shown below 980px only.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMarginItems } from '@/hooks/use-margin-items';
import { useDocumentTime } from '@/hooks/document-time-provider';
import {
  marginAccent,
  deriveKindLine,
  partitionMargin,
  type MarginItemRow,
} from '@/lib/document/margin-derivation';
import { ACTIVITIES, fmtElapsed } from '@/lib/document/time-derivation';
import { MarginItemBody } from '../margin-bodies';
import { StrataMark } from '../strata-mark';
import { fillStateAtSection } from '@/lib/document/fill-state';
import { openLedger } from '../command-bar';
import { openAccount } from '../account/account-sheet';
import { MobileAccountHeader } from '../account/mobile-account-header';
import { useMobileShell } from './mobile-shell';

const LEDGERS: {
  key: string;
  name: string;
  spine: string;
  count: string;
  weight: 'room' | 'sheet';
}[] = [
  // D14: Library, People, and Rooms are Rooms (walk in); the rest are Sheets
  // (pulled over). `name` must lowercase to the registry key — openLedger()
  // dispatches `name.toLowerCase()` and the drawer matches on `key`.
  { key: 'library', name: 'Library', spine: 'var(--color-clay)', count: 'a room · walk in', weight: 'room' },
  { key: 'orders', name: 'Orders', spine: 'var(--color-dusty-blue)', count: 'cross-engagement POs', weight: 'sheet' },
  { key: 'accounts', name: 'Accounts', spine: 'var(--color-sage)', count: 'revenue · A/R', weight: 'sheet' },
  { key: 'people', name: 'People', spine: 'var(--color-terracotta)', count: 'a room · walk in', weight: 'room' },
  { key: 'rooms', name: 'Rooms', spine: 'var(--color-aged-oak)', count: 'a room · walk in', weight: 'room' },
  { key: 'hours', name: 'Hours', spine: 'var(--color-mocha)', count: 'this week', weight: 'sheet' },
];

function Sheet({
  tone,
  onClose,
  children,
}: {
  tone: 'paper' | 'dark';
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[58] min-[980px]:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgba(44,41,38,0.5)]"
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto rounded-t-[14px] pb-[max(0.9rem,env(safe-area-inset-bottom))] motion-safe:animate-[doc-sheet-up_250ms_var(--ease-editorial)] ${
          tone === 'paper'
            ? 'border-t border-[var(--doc-ink-border)] bg-[var(--doc-paper)]'
            : 'border-t border-[rgba(250,247,242,0.18)] bg-[var(--color-charcoal)]'
        }`}
      >
        <div
          className={`mx-auto mb-1 mt-[9px] h-[4px] w-[36px] rounded-full ${
            tone === 'paper' ? 'bg-[var(--color-pearl)]' : 'bg-[rgba(250,247,242,0.2)]'
          }`}
        />
        <div className="px-[1.1rem] pb-2 pt-1">{children}</div>
      </div>
    </div>
  );
}

export function MobileSheets() {
  const { sheet, activeDoc, closeSheet, openMarginItem, openSpine } = useMobileShell();
  const router = useRouter();
  const projectId = activeDoc?.projectId ?? null;
  const proposalId = activeDoc?.proposalId ?? null;
  const { data: items } = useMarginItems(projectId, proposalId);

  const { raised, settled } = useMemo(
    () => partitionMargin(items ?? [], new Date()),
    [items],
  );
  const allItems = useMemo(() => [...raised, ...settled], [raised, settled]);

  if (!sheet) return null;

  // ── Drawer: the six books ──
  if (sheet.kind === 'drawer') {
    return (
      <Sheet tone="dark" onClose={closeSheet}>
        {/* The maker's nameplate — tap to open the Account sheet (identity,
            status, settings, sign out). Distinct from the money "Accounts" book
            in the list below. */}
        <MobileAccountHeader
          onOpen={() => {
            closeSheet();
            openAccount();
          }}
        />
        <h2 className="mt-3 font-heading text-[1.05rem] text-[var(--color-pearl)]">
          The drawer <em className="italic text-[var(--color-clay)]">· six books</em>
        </h2>
        <p className="mt-0.5 text-[11.5px] text-[rgba(250,247,242,0.45)]">
          Pulled over whatever you&apos;re holding. Put back when done.
        </p>
        <ul className="mt-2">
          {LEDGERS.map((l) => (
            <li key={l.key}>
              <button
                type="button"
                onClick={() => {
                  closeSheet();
                  openLedger(l.name);
                }}
                className="flex w-full items-center gap-3 border-b border-[rgba(250,247,242,0.08)] py-2.5 text-left"
              >
                {l.weight === 'room' ? (
                  <span aria-hidden className="flex shrink-0 flex-col gap-[2px]">
                    <i className="block h-[2px] w-[15px] rounded-[1px] bg-[var(--color-clay)]" />
                    <i className="block h-[2px] w-[11px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
                    <i className="block h-[2px] w-[7px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="h-[18px] w-[3px] shrink-0 rounded-[1px]"
                    style={{ background: l.spine }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-[13px] font-medium text-[rgba(250,247,242,0.9)]">
                    {l.name}
                    {l.weight === 'room' && (
                      <span aria-hidden className="ml-1.5 font-mono text-[11px] text-[var(--color-clay)] opacity-70">
                        ↗
                      </span>
                    )}
                  </span>
                  <span className="block font-mono text-[8.5px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                    {l.count}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }

  // ── Timer (paper) ──
  if (sheet.kind === 'timer') {
    return (
      <Sheet tone="paper" onClose={closeSheet}>
        <MobileTimerSheet />
      </Sheet>
    );
  }

  // ── Spine (paper): sections + "In the margin · N" (D3-3) ──
  if (sheet.kind === 'spine') {
    const open = allItems.filter((i) => i.kind !== 'time');
    return (
      <Sheet tone="paper" onClose={closeSheet}>
        <button
          type="button"
          onClick={() => {
            closeSheet();
            router.push('/desk');
          }}
          className="block w-full border-b border-[var(--color-pearl)] py-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
        >
          ← Put down · back to the Desk
        </button>
        <ul className="mt-1">
          {(activeDoc?.sections ?? []).map((s) => {
            const inner = (
              <>
                <StrataMark size="sm" fill={fillStateAtSection(s.key)} breathing={s.state === 'active'} />
                <span className={s.state === 'future' ? 'opacity-45' : ''}>
                  <span
                    className={`block text-[13px] ${
                      s.state === 'active'
                        ? 'font-semibold text-[var(--color-charcoal)]'
                        : s.state === 'settled'
                          ? 'text-[var(--color-aged-oak)]'
                          : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="block font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {s.sub}
                  </span>
                </span>
              </>
            );
            // Settled + active rows jump to (and unfold) their section via the
            // page's open-section listener; future rows stay inert.
            return (
              <li key={s.key}>
                {s.state === 'future' ? (
                  <div className="flex items-center gap-2.5 py-2">{inner}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet();
                      window.dispatchEvent(
                        new CustomEvent('document:open-section', { detail: s.key }),
                      );
                    }}
                    className="flex w-full items-center gap-2.5 py-2 text-left"
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* R25: room headings as jump rows — tap lands on the heading. */}
        {(activeDoc?.rooms ?? []).length > 0 && (
          <>
            <p className="mt-3 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
              Rooms
            </p>
            <ul className="mt-1">
              {(activeDoc?.rooms ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet();
                      document
                        .getElementById(`doc-room-${r.id}`)
                        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                    }}
                    className="block w-full py-1.5 text-left font-heading text-[13px] italic text-[var(--color-charcoal)]"
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-3 border-t border-[var(--color-pearl)] pt-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          In the margin · {raised.length}
        </p>
        {open.length === 0 ? (
          <p className="py-1.5 text-[11px] italic text-[var(--text-muted)]">
            The margin — decisions, messages, and money gather here.
          </p>
        ) : (
          <ul className="mt-1">
            {open.map((row) => (
              <li key={`${row.kind}-${row.item_id}`}>
                <button
                  type="button"
                  onClick={() => openMarginItem(row.item_id)}
                  className="mb-1.5 flex w-full items-start gap-2 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-2 text-left"
                  style={{ borderLeft: `2.5px solid ${marginAccent(row.kind).border}` }}
                >
                  <span
                    className="mt-px shrink-0 font-mono text-[8px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: marginAccent(row.kind).label }}
                  >
                    {deriveKindLine(row)}
                  </span>
                  <span className="text-[11.5px] leading-snug text-[var(--color-charcoal)]">
                    {row.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    );
  }

  // ── Margin item (paper): the full item + its actions (D3-2) ──
  if (sheet.kind === 'margin-item') {
    const row = allItems.find((i) => i.item_id === sheet.itemId);
    if (!row) {
      // The item left the list (resolved/refetch) — fall back to the spine.
      openSpine();
      return null;
    }
    return (
      <Sheet tone="paper" onClose={closeSheet}>
        <span
          className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: marginAccent(row.kind).label }}
        >
          {deriveKindLine(row)}
        </span>
        <h2 className="font-heading text-[1rem] font-medium leading-tight text-[var(--color-charcoal)]">
          {row.title}
        </h2>
        {row.kind !== 'time' && (
          <div className="mt-1">
            <MarginItemBody
              row={row}
              projectId={projectId}
              clientName={activeDoc?.clientName ?? ''}
              decisionRows={allItems.filter((i) => i.kind === 'decision')}
            />
          </div>
        )}
      </Sheet>
    );
  }

  return null;
}

function MobileTimerSheet() {
  const { heldProjectId, running, paused, elapsedSeconds, pause, resume, manualLog } =
    useDocumentTime();
  const [minutes, setMinutes] = useState('');
  const [activity, setActivity] = useState('design');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!heldProjectId) setFormOpen(false);
  }, [heldProjectId]);

  const parsed = parseInt(minutes, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;

  return (
    <div>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay)]">
        In hand{paused ? ' · paused' : ''}
      </span>
      <p className="mb-2 mt-1 font-mono text-[26px] tracking-[0.04em] text-[var(--color-charcoal)]">
        {fmtElapsed(elapsedSeconds)}
      </p>
      <div className="flex flex-wrap gap-2">
        {running && (
          <button type="button" onClick={pause} className={BTN}>
            Pause
          </button>
        )}
        {paused && (
          <button type="button" onClick={resume} className={BTN}>
            Resume
          </button>
        )}
        <button type="button" onClick={() => setFormOpen((v) => !v)} className={BTN}>
          + Log manually
        </button>
      </div>
      {formOpen && (
        <div className="mt-3 space-y-2">
          <input
            type="number"
            min={1}
            placeholder="Minutes"
            aria-label="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-full rounded-[5px] border border-[var(--color-pearl)] bg-white px-2.5 py-2 text-[13px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
          />
          <select
            aria-label="Activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className="w-full rounded-[5px] border border-[var(--color-pearl)] bg-white px-2.5 py-2 text-[13px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
          >
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await manualLog(parsed, activity);
                setMinutes('');
                setFormOpen(false);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-[5px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            Add entry
          </button>
        </div>
      )}
      <p className="mt-3 text-[11px] italic text-[var(--text-muted)]">
        Pick up = clock in. Put down = you decide what logs. Nothing bills itself.
      </p>
    </div>
  );
}

const BTN =
  'rounded-[4px] border border-[var(--color-pearl)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-charcoal)] active:border-[var(--color-clay)]';
