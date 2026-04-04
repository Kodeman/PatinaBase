'use client';

import { useProductEdit } from './product-edit-context';
import { RichTextField } from './rich-text-field';

export function ProductStory() {
  const { draft, updateField } = useProductEdit();

  if (!draft.description && !draft.provenance) return null;

  return (
    <div className="mb-8">
      <h3 className="mb-4 font-heading text-[1.4rem] font-normal text-[var(--text-primary)]">
        The Story
      </h3>
      <RichTextField
        value={draft.description || ''}
        onSave={(v) => updateField('description', v)}
        placeholder="Tell the story of this product — what makes it special, how it's made, why it matters."
      />
      {draft.provenance && (
        <div className="mt-6">
          <RichTextField
            value={draft.provenance}
            onSave={(v) => updateField('provenance', v)}
            className="mt-4"
            placeholder="Provenance and craft philosophy..."
          />
        </div>
      )}
    </div>
  );
}
