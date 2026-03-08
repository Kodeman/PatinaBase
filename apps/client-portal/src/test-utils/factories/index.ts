/**
 * Test factories barrel export
 */

export {
  resetIdCounter as resetTimelineIdCounter,
  createTimelineSegment,
  createTimelineProgress,
  createAttentionRequired,
  createNextMilestone,
  createImmersiveTimeline,
  createMilestoneCelebration,
  createSegmentMedia,
  createTimelineWithPhases,
  type TimelineSegment,
  type TimelineProgress,
  type AttentionRequired,
  type NextMilestone,
  type ImmersiveTimeline,
  type SegmentStatus,
  type AchievementType,
  type SegmentMedia,
} from './timeline.factory';

export {
  resetIdCounter as resetNotificationIdCounter,
  createNotification,
  createApprovalNotification,
  createMilestoneNotification,
  createCelebrationNotification,
  createAlertNotification,
  createMessageNotification,
  createNotificationList,
  createNotificationsWithState,
  getNotificationCounts,
  type NotificationCounts,
} from './notification.factory';

// Export a combined reset function
export const resetAllIdCounters = () => {
  const { resetIdCounter: resetTimeline } = require('./timeline.factory');
  const { resetIdCounter: resetNotification } = require('./notification.factory');
  resetTimeline();
  resetNotification();
};
