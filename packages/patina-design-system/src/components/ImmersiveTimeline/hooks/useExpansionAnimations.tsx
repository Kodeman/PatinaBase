'use client';

import { useState, useCallback } from 'react';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

export interface ExpansionStyles {
  maxHeight?: string;
  overflow?: string;
  transform?: string;
  transformOrigin?: string;
  transition: string;
}

export interface UseExpansionAnimationsReturn {
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string) => void;
  setExpanded: (id: string, expanded: boolean) => void;
  getExpansionStyles: (id: string, isExpanded: boolean) => ExpansionStyles;
  getIconRotation: (id: string, isExpanded: boolean) => string;
}

export function useExpansionAnimations(
  config?: ScrollAnimationConfig['expansion']
): UseExpansionAnimationsReturn {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Default configuration
  const method = config?.method ?? 'height';
  const duration = config?.duration ?? 300;
  const easing = config?.easing ?? 'ease-in-out';
  const iconRotation = config?.iconRotation ?? true;

  const isExpanded = useCallback(
    (id: string): boolean => {
      return expandedItems.has(id);
    },
    [expandedItems]
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const setExpanded = useCallback((id: string, expanded: boolean) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (expanded) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  }, []);

  const getExpansionStyles = useCallback(
    (id: string, isExpanded: boolean): ExpansionStyles => {
      // If no config provided, return minimal styles
      if (!config) {
        return {
          maxHeight: '0',
          overflow: 'hidden',
          transition: 'none',
        };
      }

      const transition = `all ${duration}ms ${easing}`;

      if (method === 'height') {
        return {
          maxHeight: isExpanded ? '9999px' : '0',
          overflow: 'hidden',
          transition,
        };
      } else {
        // scaleY method
        return {
          transform: isExpanded ? 'scaleY(1)' : 'scaleY(0)',
          transformOrigin: 'top',
          transition,
        };
      }
    },
    [config, method, duration, easing]
  );

  const getIconRotation = useCallback(
    (id: string, isExpanded: boolean): string => {
      if (!config || !iconRotation) {
        return 'rotate(0deg)';
      }
      return isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    },
    [config, iconRotation]
  );

  return {
    isExpanded,
    toggleExpanded,
    setExpanded,
    getExpansionStyles,
    getIconRotation,
  };
}