'use client';

import { useState } from 'react';
import {
  useStyleArchetypes,
  useProductStyles,
  useProductSpectrum,
  useAssignStyle,
  useSaveSpectrum,
} from '@patina/supabase';
import type { SpectrumValues } from '@patina/types';

interface StyleArchetype {
  id: string;
  name: string;
  color_hex: string | null;
}

interface ProductStyle {
  style_id: string;
  is_primary: boolean;
  style?: {
    id: string;
    name: string;
    color_hex: string | null;
  };
}

interface EmbeddedTeachingProps {
  productId: string;
  onComplete?: () => void;
}

export function EmbeddedTeaching({ productId, onComplete }: EmbeddedTeachingProps) {
  const { data: archetypes, isLoading: archetypesLoading } = useStyleArchetypes();
  const { data: existingStyles, refetch: refetchStyles } = useProductStyles(productId);
  const { data: existingSpectrum, refetch: refetchSpectrum } = useProductSpectrum(productId);
  const assignStyle = useAssignStyle();
  const saveSpectrum = useSaveSpectrum();

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const styles = (archetypes ?? []) as unknown as StyleArchetype[];
  const productStyles = (existingStyles ?? []) as unknown as ProductStyle[];
  const hasExistingStyles = productStyles.length > 0;

  const handleQuickStyleSelect = async (styleId: string) => {
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

      await refetchStyles();

      // Brief visual feedback
      setTimeout(() => {
        setSelectedStyleId(null);
        setIsSaving(false);
        onComplete?.();
      }, 500);
    } catch (error) {
      console.error('Failed to assign style:', error);
      setSelectedStyleId(null);
      setIsSaving(false);
    }
  };

  if (archetypesLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 w-32 bg-patina-clay-beige/30 rounded mb-3" />
        <div className="grid grid-cols-4 gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 bg-patina-clay-beige/30 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with expand toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-patina-charcoal">
          {hasExistingStyles ? 'Update Style' : 'Quick Teach'}
        </h4>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
        >
          {isExpanded ? 'Show less' : 'Show all styles'}
        </button>
      </div>

      {/* Prompt text */}
      {!hasExistingStyles && (
        <p className="text-sm text-patina-mocha-brown">
          Help improve matching by selecting the primary style for this product:
        </p>
      )}

      {/* Style grid */}
      <div className={`grid gap-2 ${isExpanded ? 'grid-cols-3 md:grid-cols-4' : 'grid-cols-4 md:grid-cols-6'}`}>
        {(isExpanded ? styles : styles.slice(0, 6)).map((style) => {
          const isCurrentPrimary = productStyles.some(
            (ps) => ps.style_id === style.id && ps.is_primary
          );
          const isSelected = selectedStyleId === style.id;

          return (
            <button
              key={style.id}
              onClick={() => handleQuickStyleSelect(style.id)}
              disabled={isSaving}
              className={`relative py-2 px-3 rounded-lg text-center transition-all text-xs font-medium
                ${
                  isSelected
                    ? 'bg-green-500 text-white scale-105'
                    : isCurrentPrimary
                    ? 'bg-patina-mocha-brown text-white'
                    : 'bg-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-clay-beige/50'
                }
                ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              style={
                !isSelected && !isCurrentPrimary && style.color_hex
                  ? { backgroundColor: `${style.color_hex}20` }
                  : undefined
              }
            >
              {/* Color dot */}
              {style.color_hex && (
                <div
                  className="w-3 h-3 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: style.color_hex }}
                />
              )}
              <span className="line-clamp-1">{style.name}</span>
              {isCurrentPrimary && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-patina-mocha-brown rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Success message */}
      {selectedStyleId && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Style assigned!
        </div>
      )}

      {/* Deep analysis link */}
      <div className="pt-2 border-t border-patina-clay-beige/30">
        <a
          href={`/teaching/product/${productId}`}
          className="text-xs text-patina-mocha-brown hover:text-patina-charcoal transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Full teaching with spectrum & client matching
        </a>
      </div>
    </div>
  );
}
