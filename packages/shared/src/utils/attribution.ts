// ═══════════════════════════════════════════════════════════════════════════
// ATTRIBUTION & CONSENT UTILITIES
// Client-side UTM capture, persistence, and consent management
// ═══════════════════════════════════════════════════════════════════════════

import type { TouchPoint, AttributionData, ConsentPreferences } from '../types/analytics';

const UTM_STORAGE_KEY = 'patina_attribution';
const CONSENT_STORAGE_KEY = 'patina_consent';
const CONSENT_VERSION = '1.0';
const ATTRIBUTION_WINDOW_DAYS = 30;

// ─── Attribution Manager ─────────────────────────────────────────────────

export class AttributionManager {
  static captureAttribution(): AttributionData {
    if (typeof window === 'undefined') {
      return { firstTouch: null, lastTouch: null, touchCount: 0 };
    }

    const urlParams = new URLSearchParams(window.location.search);
    const currentTouch: TouchPoint = {
      utmSource: urlParams.get('utm_source'),
      utmMedium: urlParams.get('utm_medium'),
      utmCampaign: urlParams.get('utm_campaign'),
      utmContent: urlParams.get('utm_content'),
      utmTerm: urlParams.get('utm_term'),
      referrer: document.referrer,
      landingPage: window.location.href,
      timestamp: new Date().toISOString(),
    };

    const existing = this.getStoredAttribution();

    const hasUTMParams = [
      currentTouch.utmSource,
      currentTouch.utmMedium,
      currentTouch.utmCampaign,
      currentTouch.utmContent,
      currentTouch.utmTerm,
    ].some((v) => v !== null);

    if (hasUTMParams || !existing.firstTouch) {
      const updated: AttributionData = {
        firstTouch: existing.firstTouch || currentTouch,
        lastTouch: currentTouch,
        touchCount: (existing.touchCount || 0) + 1,
      };

      try {
        localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Storage full or unavailable
      }
      return updated;
    }

    return existing;
  }

  static getAttribution(): AttributionData {
    return this.getStoredAttribution();
  }

  static clearAttribution(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(UTM_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  private static getStoredAttribution(): AttributionData {
    const empty: AttributionData = { firstTouch: null, lastTouch: null, touchCount: 0 };

    if (typeof window === 'undefined') return empty;

    try {
      const stored = localStorage.getItem(UTM_STORAGE_KEY);
      if (!stored) return empty;

      const data = JSON.parse(stored) as AttributionData;

      // Check expiry
      const firstTouchTime = data.firstTouch?.timestamp
        ? new Date(data.firstTouch.timestamp).getTime()
        : 0;
      const daysSince = (Date.now() - firstTouchTime) / (1000 * 60 * 60 * 24);

      if (daysSince > ATTRIBUTION_WINDOW_DAYS) {
        localStorage.removeItem(UTM_STORAGE_KEY);
        return empty;
      }

      return data;
    } catch {
      return empty;
    }
  }
}

// ─── Consent Manager ─────────────────────────────────────────────────────

export class ConsentManager {
  static getConsent(): ConsentPreferences & { version?: string } {
    const defaults: ConsentPreferences = {
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
    };

    if (typeof window === 'undefined') return defaults;

    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!stored) return defaults;
      return JSON.parse(stored);
    } catch {
      return defaults;
    }
  }

  static hasConsented(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(CONSENT_STORAGE_KEY) !== null;
  }

  static updateConsent(preferences: ConsentPreferences): void {
    if (typeof window === 'undefined') return;

    const data = {
      ...preferences,
      necessary: true, // Always true
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
    };

    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage unavailable
    }
  }

  static clearConsent(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
