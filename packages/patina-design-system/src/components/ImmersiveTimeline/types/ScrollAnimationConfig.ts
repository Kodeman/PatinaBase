export interface ScrollAnimationConfig {
  header?: {
    fadeOut: boolean;
    fadeRange?: [number, number]; // [startPx, endPx], default [0, 200]
    darkMode?: boolean;
    darkModeThreshold?: number; // px, default 100
    opacity?: number; // final opacity, default 0
    easing?: string; // CSS easing, default 'ease-out'
  };

  background?: {
    darkOverlay: boolean;
    maxOpacity?: number; // default 0.7
    gradient?: string; // default 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4))'
    transitionDuration?: number; // ms, default 300
  };

  cards?: {
    entrance: 'fade' | 'fade-scale' | 'fade-scale-slide';
    fadeFrom?: number; // opacity, default 0
    scaleFrom?: number; // default 0.95
    slideDistance?: number; // px, default 20
    duration?: number; // ms, default 300
    easing?: string; // default 'ease-out'
    threshold?: number; // IntersectionObserver, default 0.25
    stagger?: number; // ms between cards, default 0
  };

  expansion?: {
    method: 'height' | 'scaleY';
    duration?: number; // ms, default 300
    easing?: string; // default 'ease-in-out'
    iconRotation?: boolean; // rotate arrow icon, default true
  };
}