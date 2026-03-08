/**
 * MSW handlers barrel export
 * Import all handlers from this file
 */

export * from './timeline.handlers';
export * from './notification.handlers';

// Combine all handlers for easy setup
import { timelineHandlers } from './timeline.handlers';
import { notificationHandlers } from './notification.handlers';

export const handlers = [
  ...timelineHandlers,
  ...notificationHandlers,
];
