import { describe, it, expect } from 'vitest';
import type { ScrollAnimationConfig } from './ScrollAnimationConfig';

describe('ScrollAnimationConfig', () => {
  it('should accept valid configuration', () => {
    const config: ScrollAnimationConfig = {
      header: {
        fadeOut: true,
        fadeRange: [0, 200],
        darkMode: true,
        darkModeThreshold: 100,
      },
      background: {
        darkOverlay: true,
        maxOpacity: 0.7,
      },
      cards: {
        entrance: 'fade-scale-slide',
        duration: 300,
        threshold: 0.25,
      },
      expansion: {
        method: 'scaleY',
        duration: 300,
      },
    };

    expect(config).toBeDefined();
    expect(config.header?.fadeOut).toBe(true);
  });

  it('should accept partial configuration', () => {
    const config: ScrollAnimationConfig = {
      header: { fadeOut: true },
    };

    expect(config).toBeDefined();
    expect(config.background).toBeUndefined();
  });
});