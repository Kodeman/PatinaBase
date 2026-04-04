'use client';

import { useProductEdit } from './product-edit-context';
import { InlineEditable } from './inline-editable';
import { UploadZone } from '@/components/portal';

interface MaterialSwatch {
  name: string;
  description?: string;
  imageUrl?: string;
}

export function MaterialCloseups() {
  const { mode, draft, updateField } = useProductEdit();

  // Derive material swatches from materials array
  // Each material is a string; in edit mode we allow adding descriptions
  const materials: MaterialSwatch[] = (draft.materials || []).map((m) => {
    if (typeof m === 'string') return { name: m };
    return m as MaterialSwatch;
  });

  if (materials.length === 0 && mode === 'present') return null;

  return (
    <div className="mb-8">
      {/* Section separator */}
      <div className="mb-2 flex flex-col gap-1 py-4">
        <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
        <div className="h-[1.5px] w-12 rounded-sm bg-[var(--accent-primary)] opacity-70" />
        <div className="h-[1.5px] w-9 rounded-sm bg-[var(--accent-primary)] opacity-35" />
      </div>

      <h3 className="mb-2 font-heading text-[1.4rem] font-normal text-[var(--text-primary)]">
        Materials
      </h3>
      <p className="mb-5 font-body text-[0.82rem] text-[var(--text-muted)]">
        Every material chosen for longevity. {mode === 'present' ? 'Tap to see close-up texture.' : 'Click to edit details.'}
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {materials.map((mat, i) => (
          <div
            key={i}
            className="group cursor-default overflow-hidden rounded-md transition-transform hover:-translate-y-0.5"
          >
            {/* Swatch image placeholder */}
            <div className="aspect-square overflow-hidden rounded-md bg-[var(--color-pearl)]">
              {mat.imageUrl ? (
                <img src={mat.imageUrl} alt={mat.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--color-pearl)] to-[rgba(196,165,123,0.15)]">
                  <span className="type-meta">{mat.name}</span>
                </div>
              )}
            </div>

            {/* Name + description */}
            <InlineEditable
              value={mat.name}
              onSave={(v) => {
                const updated = [...draft.materials];
                updated[i] = v;
                updateField('materials', updated);
              }}
              tag="div"
              className="pt-2 font-body text-[0.8rem] font-medium text-[var(--text-primary)]"
              placeholder="Material name"
            />
            {mat.description && (
              <div className="font-body text-[0.7rem] leading-snug text-[var(--text-muted)]">
                {mat.description}
              </div>
            )}

            {/* Edit mode: remove */}
            {mode === 'edit' && (
              <button
                onClick={() =>
                  updateField(
                    'materials',
                    draft.materials.filter((_, idx) => idx !== i)
                  )
                }
                className="mt-1 cursor-pointer border-none bg-transparent font-mono text-[0.5rem] uppercase tracking-[0.04em] text-[var(--color-terracotta)] opacity-0 transition-opacity group-hover:opacity-100"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        {/* Upload zone in edit mode */}
        {mode === 'edit' && (
          <div className="aspect-square">
            <UploadZone
              onFiles={(files) => {
                const newMaterials = files.map((f) => f.name.replace(/\.\w+$/, ''));
                updateField('materials', [...draft.materials, ...newMaterials]);
              }}
              accept="image/*"
              className="!flex !h-full !items-center !justify-center !rounded-md"
            />
          </div>
        )}
      </div>

      {/* Edit mode: add material by name */}
      {mode === 'edit' && (
        <input
          type="text"
          placeholder="+ Add material by name"
          className="mt-3 rounded-sm border border-dashed border-[var(--color-pearl)] bg-transparent px-3 py-2 font-body text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              updateField('materials', [...draft.materials, e.currentTarget.value.trim()]);
              e.currentTarget.value = '';
            }
          }}
        />
      )}
    </div>
  );
}
