'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  useStyleArchetypes,
  useAssignStyle,
  useProduct,
} from '@patina/supabase';

interface StyleArchetype {
  id: string;
  name: string;
  color_hex: string | null;
}

interface QuickTeachModalProps {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export function QuickTeachModal({ productId, isOpen, onClose, onComplete }: QuickTeachModalProps) {
  const { data: product, isLoading: productLoading } = useProduct(productId);
  const { data: archetypes, isLoading: archetypesLoading } = useStyleArchetypes();
  const assignStyle = useAssignStyle();

  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const styles = (archetypes ?? []) as unknown as StyleArchetype[];

  const handleStyleSelect = useCallback(async (styleId: string) => {
    if (isSaving) return;

    setSelectedStyleId(styleId);
    setIsSaving(true);

    try {
      await assignStyle.mutateAsync({
        productId,
        styleId,
        isPrimary: true,
        confidence: 1.0,
      });

      // Brief delay for visual feedback
      setTimeout(() => {
        onComplete?.();
        onClose();
      }, 500);
    } catch (error) {
      console.error('Failed to assign style:', error);
      setSelectedStyleId(null);
      setIsSaving(false);
    }
  }, [productId, assignStyle, isSaving, onComplete, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Number keys 1-9 for quick style selection
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && styles.length >= num) {
        handleStyleSelect(styles[num - 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, styles, handleStyleSelect, onClose]);

  if (!isOpen) return null;

  const isLoading = productLoading || archetypesLoading;
  const productData = product as { name: string; images: string[]; price_retail: number | null } | undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-patina-clay-beige border-t-patina-mocha-brown rounded-full animate-spin mx-auto mb-4" />
            <p className="text-patina-mocha-brown">Loading...</p>
          </div>
        ) : (
          <>
            {/* Product preview */}
            <div className="flex gap-4 p-4 border-b border-patina-clay-beige/30">
              <div className="w-20 h-20 bg-patina-off-white rounded-lg overflow-hidden flex-shrink-0">
                {productData?.images?.[0] ? (
                  <Image
                    src={productData.images[0]}
                    alt={productData.name || 'Product'}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-patina-clay-beige">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-patina-charcoal line-clamp-2">
                  {productData?.name || 'Unknown Product'}
                </h3>
                <p className="text-sm text-patina-mocha-brown mt-1">
                  Select the primary style for this product
                </p>
              </div>
            </div>

            {/* Style grid */}
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3">
                {styles.map((style, index) => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style.id)}
                    disabled={isSaving}
                    className={`relative py-3 px-2 rounded-lg text-center transition-all
                      ${
                        selectedStyleId === style.id
                          ? 'bg-green-500 text-white scale-105 shadow-lg'
                          : 'bg-patina-off-white text-patina-charcoal hover:bg-patina-clay-beige/30'
                      }
                      ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {/* Keyboard shortcut hint */}
                    {index < 9 && (
                      <span className="absolute top-1 left-2 text-xs text-patina-mocha-brown/50">
                        {index + 1}
                      </span>
                    )}

                    {/* Color indicator */}
                    {style.color_hex && (
                      <div
                        className="w-6 h-6 rounded-full mx-auto mb-2"
                        style={{ backgroundColor: style.color_hex }}
                      />
                    )}

                    <span className="text-sm font-medium line-clamp-1">{style.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-patina-off-white/50 border-t border-patina-clay-beige/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-patina-mocha-brown/70">
                  Press 1-9 to select • Esc to close
                </span>
                <a
                  href={`/teaching/product/${productId}`}
                  className="text-xs text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
                >
                  Full teaching →
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
