/**
 * Performance monitoring utilities export
 */

export {
  initWebVitals,
  sendWebVitalsToAnalytics,
  trackCustomMetric,
  observeLongTasks,
  observeLayoutShifts,
  getNavigationTiming,
  getResourceTiming,
  measureApiRequest,
} from './web-vitals';
export type { WebVitalsMetric, WebVitalsConfig } from './web-vitals';
