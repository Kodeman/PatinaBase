'use client';

import type { ProductTier } from '@patina/types';
import { useProductEdit } from './product-edit-context';
import { InlineEditable } from './inline-editable';
import { TierBadge, StyleTag, PortalButton } from '@/components/portal';

interface ProductIdentityProps {
  onAddToProposal?: () => void;
  onTryInRoom?: () => void;
  onSaveToCollection?: () => void;
}

export function ProductIdentity({
  onAddToProposal,
  onTryInRoom,
  onSaveToCollection,
}: ProductIdentityProps) {
  const { mode, draft, updateField, toggleMode } = useProductEdit();

  const isPublished = draft.status === 'published' || draft.status === 'active';

  return (
    <div className="mb-8 border-b border-[var(--border-subtle)] pb-8">
      <div className="grid gap-8 md:grid-cols-[1fr_auto]">
        {/* Left: product info */}
        <div>
          {/* Tier + Status */}
          <div className="mb-2.5 flex items-center gap-2">
            {draft.tier && <TierBadge tier={draft.tier as ProductTier} />}
            {isPublished && (
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-sage)]">
                ● In Stock
              </span>
            )}
          </div>

          {/* Name */}
          <InlineEditable
            value={draft.name}
            onSave={(v) => updateField('name', v)}
            tag="h1"
            className="mb-1 font-heading text-[clamp(1.8rem,3.5vw,2.6rem)] font-normal leading-[1.15] tracking-[-0.02em] text-[var(--text-primary)]"
            placeholder="Product Name"
          />

          {/* Maker */}
          <InlineEditable
            value={[draft.brand, draft.makerLocation].filter(Boolean).join(' · ')}
            onSave={(v) => {
              const parts = v.split(' · ');
              updateField('brand', parts[0]?.trim() || '');
              if (parts[1]) updateField('makerLocation', parts[1].trim());
            }}
            tag="div"
            className="mb-5 font-body text-[0.95rem] italic text-[var(--color-aged-oak)]"
            placeholder="Maker · Location"
          />

          {/* Price */}
          <div className="mb-1 font-heading text-[2.2rem] font-bold text-[var(--text-primary)]">
            {mode === 'edit' ? (
              <input
                type="number"
                value={draft.price || ''}
                onChange={(e) => updateField('price', Number(e.target.value))}
                className="w-48 border-b border-dashed border-transparent bg-transparent font-heading text-[2.2rem] font-bold text-[var(--text-primary)] outline-none hover:border-[rgba(196,165,123,0.4)] focus:border-[var(--accent-primary)]"
                placeholder="0"
              />
            ) : (
              `$${draft.price.toLocaleString()}`
            )}
          </div>

          {/* Trade / Lead Time */}
          <div className="type-meta mb-5">
            {[
              draft.tradePrice && `Trade: $${Number(draft.tradePrice).toLocaleString()}`,
              draft.leadTime && `Lead Time: ${draft.leadTime}`,
              'Made to order',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>

          {/* Style Tags */}
          {(draft.styleTags.length > 0 || mode === 'edit') && (
            <div className="flex flex-wrap gap-1.5">
              {draft.styleTags.map((tag, i) => (
                <div key={tag} className="group relative">
                  <StyleTag label={tag} active={i < 2} />
                  {mode === 'edit' && (
                    <button
                      onClick={() =>
                        updateField(
                          'styleTags',
                          draft.styleTags.filter((_, idx) => idx !== i)
                        )
                      }
                      className="absolute -right-1 -top-1 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full border-none bg-[var(--color-terracotta)] text-[0.45rem] text-white opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {mode === 'edit' && (
                <input
                  type="text"
                  placeholder="+ Add tag"
                  className="rounded-sm border border-dashed border-[var(--color-pearl)] bg-transparent px-2.5 py-1 font-body text-[0.72rem] text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      updateField('styleTags', [...draft.styleTags, e.currentTarget.value.trim()]);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex min-w-[180px] flex-col gap-2">
          {mode === 'present' ? (
            <>
              <PortalButton variant="primary" className="w-full !justify-center" onClick={onAddToProposal}>
                Add to Proposal
              </PortalButton>
              <PortalButton variant="secondary" className="w-full !justify-center" onClick={onTryInRoom}>
                Try in Your Room
              </PortalButton>
              <PortalButton
                variant="ghost"
                className="w-full !justify-center !text-[0.75rem]"
                onClick={onSaveToCollection}
              >
                Save to Collection
              </PortalButton>
            </>
          ) : (
            <PortalButton variant="secondary" className="w-full !justify-center" onClick={toggleMode}>
              Preview as Client
            </PortalButton>
          )}
        </div>
      </div>
    </div>
  );
}
