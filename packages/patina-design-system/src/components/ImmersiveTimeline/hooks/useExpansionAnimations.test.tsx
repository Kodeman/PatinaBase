import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExpansionAnimations } from './useExpansionAnimations';
import type { ScrollAnimationConfig } from '../types/ScrollAnimationConfig';

describe('useExpansionAnimations', () => {
  it('should return default styles when no config provided', () => {
    const { result } = renderHook(() => useExpansionAnimations());

    const styles = result.current.getExpansionStyles('test-id', false);
    expect(styles.maxHeight).toBe('0');
    expect(styles.overflow).toBe('hidden');
  });

  it('should handle height method expansion', () => {
    const config: ScrollAnimationConfig = {
      expansion: {
        method: 'height',
        duration: 300,
        easing: 'ease-in-out',
      },
    };

    const { result } = renderHook(() => useExpansionAnimations(config.expansion));

    // Collapsed state
    let styles = result.current.getExpansionStyles('test-id', false);
    expect(styles.maxHeight).toBe('0');
    expect(styles.overflow).toBe('hidden');
    expect(styles.transition).toContain('300ms');
    expect(styles.transition).toContain('ease-in-out');

    // Expanded state
    styles = result.current.getExpansionStyles('test-id', true);
    expect(styles.maxHeight).toBe('9999px');
    expect(styles.overflow).toBe('hidden');
  });

  it('should handle scaleY method expansion', () => {
    const config: ScrollAnimationConfig = {
      expansion: {
        method: 'scaleY',
        duration: 400,
        easing: 'ease-out',
      },
    };

    const { result } = renderHook(() => useExpansionAnimations(config.expansion));

    // Collapsed state
    let styles = result.current.getExpansionStyles('test-id', false);
    expect(styles.transform).toBe('scaleY(0)');
    expect(styles.transformOrigin).toBe('top');
    expect(styles.transition).toContain('400ms');
    expect(styles.transition).toContain('ease-out');

    // Expanded state
    styles = result.current.getExpansionStyles('test-id', true);
    expect(styles.transform).toBe('scaleY(1)');
    expect(styles.transformOrigin).toBe('top');
  });

  it('should handle icon rotation when enabled', () => {
    const config: ScrollAnimationConfig = {
      expansion: {
        method: 'height',
        iconRotation: true,
        duration: 300,
      },
    };

    const { result } = renderHook(() => useExpansionAnimations(config.expansion));

    // Collapsed state
    let rotation = result.current.getIconRotation('test-id', false);
    expect(rotation).toBe('rotate(0deg)');

    // Expanded state
    rotation = result.current.getIconRotation('test-id', true);
    expect(rotation).toBe('rotate(180deg)');
  });

  it('should not rotate icon when disabled', () => {
    const config: ScrollAnimationConfig = {
      expansion: {
        method: 'height',
        iconRotation: false,
      },
    };

    const { result } = renderHook(() => useExpansionAnimations(config.expansion));

    // Both states should have no rotation
    let rotation = result.current.getIconRotation('test-id', false);
    expect(rotation).toBe('rotate(0deg)');

    rotation = result.current.getIconRotation('test-id', true);
    expect(rotation).toBe('rotate(0deg)');
  });

  it('should track expanded state for multiple items', () => {
    const config: ScrollAnimationConfig = {
      expansion: {
        method: 'height',
      },
    };

    const { result } = renderHook(() => useExpansionAnimations(config.expansion));

    // Toggle first item
    act(() => {
      result.current.toggleExpanded('item-1');
    });

    expect(result.current.isExpanded('item-1')).toBe(true);
    expect(result.current.isExpanded('item-2')).toBe(false);

    // Toggle second item
    act(() => {
      result.current.toggleExpanded('item-2');
    });

    expect(result.current.isExpanded('item-1')).toBe(true);
    expect(result.current.isExpanded('item-2')).toBe(true);

    // Toggle first item again
    act(() => {
      result.current.toggleExpanded('item-1');
    });

    expect(result.current.isExpanded('item-1')).toBe(false);
    expect(result.current.isExpanded('item-2')).toBe(true);
  });

  it('should set expanded state directly', () => {
    const config: ScrollAnimationConfig = {
      expansion: {
        method: 'height',
      },
    };

    const { result } = renderHook(() => useExpansionAnimations(config.expansion));

    // Set to expanded
    act(() => {
      result.current.setExpanded('item-1', true);
    });

    expect(result.current.isExpanded('item-1')).toBe(true);

    // Set to collapsed
    act(() => {
      result.current.setExpanded('item-1', false);
    });

    expect(result.current.isExpanded('item-1')).toBe(false);
  });
});