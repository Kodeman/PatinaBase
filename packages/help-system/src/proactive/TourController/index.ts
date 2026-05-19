/**
 * <TourController /> — Proactive-layer multi-step orchestrator (spec §4.7).
 * Public exports for consumers; the persistence module is intentionally not
 * re-exported here since portal code should never read tour state directly.
 */
export { TourController } from './TourController'
export type {
  TourControllerProps,
  TourControllerAPI,
  CoachmarkStep,
} from './TourController'

// Persistence — exported separately so future "Show me around again"
// affordances can `clearTourState(tourId)` from a Profile menu.
export {
  getTourState,
  setTourState,
  clearTourState,
  TOUR_STATE_STORAGE_PREFIX,
} from './tourState'
export type { TourState } from './tourState'
