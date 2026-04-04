'use client';

import { useProductEdit } from './product-edit-context';
import { InlineEditable } from './inline-editable';

export function MakerStory() {
  const { mode, draft, updateField } = useProductEdit();

  // Only show if we have brand info
  if (!draft.brand && mode === 'present') return null;

  return (
    <div className="mb-8">
      {/* Section separator */}
      <div className="mb-2 flex flex-col gap-1 py-4">
        <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
        <div className="h-[1.5px] w-12 rounded-sm bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-9 rounded-sm bg-[var(--accent-primary)] opacity-35" />
      </div>

      <div className="grid items-start gap-12 md:grid-cols-[1fr_1.2fr]">
        {/* Left: Maker info */}
        <div>
          <h3 className="mb-4 font-heading text-[1.4rem] font-normal text-[var(--text-primary)]">
            The Maker
          </h3>

          <InlineEditable
            value={draft.brand}
            onSave={(v) => updateField('brand', v)}
            tag="div"
            className="mb-0.5 font-heading text-[1.1rem] font-medium text-[var(--text-primary)]"
            placeholder="Maker Name"
          />

          <div className="mb-4 font-body text-[0.82rem] text-[var(--text-muted)]">
            <InlineEditable
              value={draft.makerLocation || ''}
              onSave={(v) => updateField('makerLocation', v)}
              tag="span"
              className="font-body text-[0.82rem] text-[var(--text-muted)]"
              placeholder="Location · Founded Year · Generation"
            />
          </div>

          {/* Provenance / maker narrative */}
          <InlineEditable
            value={draft.provenance || ''}
            onSave={(v) => updateField('provenance', v)}
            tag="div"
            className="font-body text-[0.9rem] leading-[1.75] text-[var(--text-body)]"
            placeholder="Tell the maker's story — workshop history, craft philosophy, sourcing approach..."
            multiline
          />

          {/* Certification tags */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {['FSC Certified', 'Carbon Neutral', 'Made to Order'].map((tag) => (
              <span
                key={tag}
                className="inline-flex rounded-sm border border-[var(--color-pearl)] bg-[var(--bg-primary)] px-2.5 py-1 font-body text-[0.65rem] font-medium text-[var(--color-mocha)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Workshop photo */}
        <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-[var(--color-pearl)]">
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-center font-mono text-[0.72rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Workshop Photo
              <br />
              <span className="text-[0.55rem] opacity-70">{draft.brand} workshop</span>
            </span>
          </div>
          {mode === 'edit' && (
            <div className="absolute inset-0 flex items-center justify-center bg-[rgba(44,41,38,0.3)] opacity-0 transition-opacity hover:opacity-100">
              <span className="rounded bg-[var(--bg-surface)] px-3 py-1.5 font-body text-[0.75rem] text-[var(--text-primary)]">
                Replace Photo
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
