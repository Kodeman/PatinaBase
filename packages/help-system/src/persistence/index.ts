/**
 * Help & Guidance System persistence layer (Sprint 4 / S4-1).
 *
 * Provides the Supabase-backed adapter for `profiles.help_state` JSONB so
 * proactive surfaces (tours + feature announcements) persist cross-device.
 * localStorage remains the anon / offline fallback.
 */
export {
  loadHelpState,
  saveHelpState,
  createSupabaseTourStateBackend,
  createSupabaseFeatureAnnouncementBackend,
  createSupabaseMarginNoteBackend,
  createSupabaseFirstAuthoredBackend,
  createSupabaseHelpStateBackends,
  migrateLocalToSupabase,
} from './supabaseAdapter'
export type {
  CreateSupabaseBackendsResult,
  CreateSupabaseMarginNoteBackendResult,
  CreateSupabaseFirstAuthoredBackendResult,
  MigrationResult,
} from './supabaseAdapter'
export type {
  HelpStateBlob,
  TourStateBackend,
  FeatureAnnouncementStateBackend,
  MarginNoteStateBackend,
  FirstAuthoredStateBackend,
  HelpStateSupabaseClient,
} from './types'
