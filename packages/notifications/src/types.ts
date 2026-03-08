/**
 * Re-export notification types from shared package.
 * This file exists for internal convenience.
 */
export type {
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  NotificationPriority,
  NotificationPreferences,
  NotificationLog,
  NotifyOptions,
  NotificationResult,
  NotificationJob,
  DigestFrequency,
} from '@patina/shared/types';

export {
  NOTIFICATION_TYPE_TO_PREFERENCE,
  TRANSACTIONAL_TYPES,
} from '@patina/shared/types';
