/**
 * User Presence Utilities
 *
 * Provides localStorage-based presence state management with cross-tab sync.
 * @module utils/presence
 */

import type { UserPresenceStatus, UserPresence } from '@patina/types';

const PRESENCE_STORAGE_KEY = 'patina:user-presence';
const PRESENCE_CHANNEL_NAME = 'patina:presence-sync';

/**
 * Default presence state
 */
export const DEFAULT_PRESENCE: UserPresence = {
  status: 'online',
  lastActiveAt: Date.now(),
  manuallySet: false,
};

/**
 * Get current presence from localStorage
 */
export function getStoredPresence(): UserPresence {
  if (typeof window === 'undefined') return DEFAULT_PRESENCE;

  try {
    const stored = localStorage.getItem(PRESENCE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as UserPresence;
      // Validate the status is valid
      if (['online', 'offline', 'busy', 'away'].includes(parsed.status)) {
        return parsed;
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return DEFAULT_PRESENCE;
}

/**
 * Store presence in localStorage
 */
export function storePresence(presence: UserPresence): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(presence));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Clear stored presence (for sign out)
 */
export function clearStoredPresence(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(PRESENCE_STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Create a BroadcastChannel for cross-tab presence sync
 * Returns null if BroadcastChannel is not available
 */
export function createPresenceChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return null;
  }

  try {
    return new BroadcastChannel(PRESENCE_CHANNEL_NAME);
  } catch {
    return null;
  }
}

/**
 * Broadcast presence change to other tabs
 */
export function broadcastPresenceChange(
  channel: BroadcastChannel | null,
  presence: UserPresence
): void {
  if (!channel) return;

  try {
    channel.postMessage({ type: 'PRESENCE_UPDATE', presence });
  } catch {
    // Ignore broadcast errors
  }
}

/**
 * Idle detection configuration
 */
export interface IdleConfig {
  /** Time in ms before user is considered idle (default: 5 minutes) */
  idleTimeout?: number;
  /** Events to track for activity (default: mousedown, keydown, touchstart, scroll) */
  activityEvents?: string[];
}

/**
 * Default idle detection config
 */
export const DEFAULT_IDLE_CONFIG: Required<IdleConfig> = {
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  activityEvents: ['mousedown', 'keydown', 'touchstart', 'scroll'],
};

/**
 * Create an idle detector that calls onIdle when user becomes idle
 * Returns a cleanup function
 */
export function createIdleDetector(
  onIdle: () => void,
  onActive: () => void,
  config: IdleConfig = {}
): () => void {
  if (typeof window === 'undefined') return () => {};

  const { idleTimeout, activityEvents } = { ...DEFAULT_IDLE_CONFIG, ...config };
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let isIdle = false;

  const resetTimer = () => {
    if (timeoutId) clearTimeout(timeoutId);

    if (isIdle) {
      isIdle = false;
      onActive();
    }

    timeoutId = setTimeout(() => {
      isIdle = true;
      onIdle();
    }, idleTimeout);
  };

  // Start timer
  resetTimer();

  // Add activity listeners
  activityEvents.forEach((event) => {
    window.addEventListener(event, resetTimer, { passive: true });
  });

  // Handle visibility change
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      resetTimer();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Return cleanup function
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    activityEvents.forEach((event) => {
      window.removeEventListener(event, resetTimer);
    });
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * Presence status options for UI dropdowns
 */
export const PRESENCE_STATUS_OPTIONS: Array<{
  value: UserPresenceStatus;
  label: string;
  description: string;
}> = [
  { value: 'online', label: 'Online', description: 'You appear as available' },
  { value: 'away', label: 'Away', description: 'You appear as away' },
  { value: 'busy', label: 'Busy', description: 'You appear as busy' },
  { value: 'offline', label: 'Appear Offline', description: 'You appear as offline' },
];
