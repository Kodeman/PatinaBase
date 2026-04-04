'use client';

import { useProductEdit } from './product-edit-context';
import { InlineEditable } from './inline-editable';
import { DetailRow } from '@/components/portal';

interface SpecRow {
  label: string;
  value: string;
  key: string;
}

export function Specifications() {
  const { mode, draft, updateField } = useProductEdit();

  // Build spec rows from draft data
  const specRows: SpecRow[] = [
    draft.dimensions?.width && draft.dimensions?.depth && draft.dimensions?.height
      ? {
          label: 'Dimensions',
          value: `${draft.dimensions.width}"${draft.dimensions.unit === 'cm' ? 'cm' : ''} × ${draft.dimensions.depth}" × ${draft.dimensions.height}"`,
          key: 'dimensions',
        }
      : null,
    draft.weight?.value
      ? { label: 'Weight', value: `${draft.weight.value} ${draft.weight.unit || 'lbs'}`, key: 'weight' }
      : null,
    draft.materials?.length
      ? { label: 'Materials', value: draft.materials.join(', '), key: 'materials-spec' }
      : null,
    draft.finish ? { label: 'Finish', value: draft.finish, key: 'finish' } : null,
    draft.assembly ? { label: 'Assembly', value: draft.assembly, key: 'assembly' } : null,
  ].filter(Boolean) as SpecRow[];

  return (
    <div className="mb-8">
      {/* Section separator */}
      <div className="mb-2 flex flex-col gap-1 py-4">
        <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
        <div className="h-[1.5px] w-12 rounded-sm bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-9 rounded-sm bg-[var(--accent-primary)] opacity-35" />
      </div>

      <div className="grid gap-12 md:grid-cols-2">
        {/* Left: Specifications */}
        <div>
          <h3 className="mb-4 font-heading text-[1.4rem] font-normal text-[var(--text-primary)]">
            Specifications
          </h3>

          {mode === 'present' ? (
            <>
              {specRows.map((row) => (
                <DetailRow key={row.key} label={row.label} value={row.value} />
              ))}
            </>
          ) : (
            <>
              {/* Editable dimension fields */}
              <div className="mb-3 grid grid-cols-[110px_1fr] items-center gap-3">
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  Dimensions
                </span>
                <div className="flex gap-2">
                  {(['width', 'depth', 'height'] as const).map((dim) => (
                    <input
                      key={dim}
                      type="number"
                      value={draft.dimensions?.[dim] || ''}
                      onChange={(e) =>
                        updateField('dimensions', {
                          ...draft.dimensions,
                          [dim]: Number(e.target.value),
                          unit: draft.dimensions?.unit || 'in',
                        })
                      }
                      placeholder={dim.charAt(0).toUpperCase() + dim.slice(1)}
                      className="w-20 rounded-sm border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-2 py-1 font-body text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    />
                  ))}
                </div>
              </div>

              {/* Editable scalar fields */}
              {[
                { label: 'Finish', key: 'finish' as const, value: draft.finish },
                { label: 'Assembly', key: 'assembly' as const, value: draft.assembly },
              ].map(({ label, key, value }) => (
                <div key={key} className="mb-3 grid grid-cols-[110px_1fr] items-start gap-3">
                  <span className="pt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    {label}
                  </span>
                  <InlineEditable
                    value={value || ''}
                    onSave={(v) => updateField(key, v)}
                    tag="span"
                    className="font-body text-[0.85rem] text-[var(--text-body)]"
                    placeholder={`Enter ${label.toLowerCase()}...`}
                  />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Right: Care */}
        <div>
          <h3 className="mb-4 font-heading text-[1.4rem] font-normal text-[var(--text-primary)]">
            Care
          </h3>

          {mode === 'present' ? (
            <div className="font-body text-[0.9rem] leading-[1.75] text-[var(--text-body)]">
              {draft.careInstructions || (
                <span className="italic text-[var(--text-muted)]">No care instructions added.</span>
              )}
            </div>
          ) : (
            <InlineEditable
              value={draft.careInstructions || ''}
              onSave={(v) => updateField('careInstructions', v)}
              tag="div"
              className="font-body text-[0.9rem] leading-[1.75] text-[var(--text-body)]"
              placeholder="Care instructions — daily cleaning, maintenance schedule, what to avoid..."
              multiline
            />
          )}
        </div>
      </div>
    </div>
  );
}
