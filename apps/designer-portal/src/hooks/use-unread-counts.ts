'use client';

/**
 * Returns unread notification and message counts.
 * Stub implementation — wire to Supabase realtime subscriptions later.
 */
export function useUnreadCounts(): {
  notifications: number;
  messages: number;
} {
  // TODO: Wire to Supabase realtime for live counts
  // - notifications: subscribe to notifications table where read = false
  // - messages: subscribe to client_messages where read = false and direction = 'in'
  return {
    notifications: 0,
    messages: 0,
  };
}
