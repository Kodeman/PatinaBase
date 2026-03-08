export { notify } from './notify';
export { getUserPreferences, isTypeEnabled, isChannelEnabled, isQuietHours, DEFAULT_PREFERENCES } from './preferences';
export { createEdgeFunctionQueue } from './queue';
export type { NotificationQueue } from './queue';
export { generateUnsubscribeToken, verifyUnsubscribeToken, generateUnsubscribeUrl } from './tokens';
export type { UnsubscribeTokenPayload, UnsubscribeTokenResult } from './tokens';
export { resolveAudience, estimateAudienceSize, snapshotAudience } from './audience';
export type { AudienceRecipient, AudienceSnapshot } from './audience';

// Re-export types for convenience
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
} from './types';
export { NOTIFICATION_TYPE_TO_PREFERENCE, TRANSACTIONAL_TYPES } from './types';
export { processEnrollments, enrollUser, unenrollUser, evaluateCondition } from './automation-engine';
export type { ProcessResult } from './automation-engine';
export { splitAudience, evaluateAbWinner, getEvaluationTime } from './ab-test';
export type { AbSplit, AbResult } from './ab-test';
