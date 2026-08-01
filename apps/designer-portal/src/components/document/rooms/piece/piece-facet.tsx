'use client';

/**
 * A facet of the Piece Room — one fillable grouping. In editable mode it IS the
 * Composing Page's `ComposeSection` (collapsible, done-tick, status word) so the
 * two Rooms read identically. In read-only mode it renders as an always-open
 * static block — the specimen sheet, no chevron, no inputs.
 */

import { ComposeSection } from '../../compose/compose-section';

export function PieceFacet({
  name,
  status,
  done,
  open,
  onToggle,
  readOnly,
  children,
}: {
  name: string;
  status: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  if (readOnly) {
    return (
      <section className="mb-2.5 overflow-hidden rounded-[8px] border border-[var(--color-pearl)] bg-[var(--doc-paper)]">
        <div className="flex min-h-11 items-center gap-3 px-4 py-2.5">
          <span className="doc-type-body font-semibold leading-tight text-[var(--color-charcoal)]">
            {name}
          </span>
          {status && (
            <span className="doc-type-meta ml-auto truncate italic leading-tight opacity-70">
              {status}
            </span>
          )}
        </div>
        <div className="border-t border-[var(--doc-ink-border)] px-4 pb-4 pt-1">
          {children}
        </div>
      </section>
    );
  }

  return (
    <ComposeSection
      name={name}
      status={status}
      done={done}
      open={open}
      onToggle={onToggle}
    >
      {children}
    </ComposeSection>
  );
}
