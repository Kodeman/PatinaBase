/**
 * Help-system analytics, jest-safe (onboarding Wave 1, task L5).
 *
 * `HELP_EVENTS` + `safeCapture` are the taxonomy of record, but the
 * `@patina/help-system` barrel pulls the Layer-4 reference components, whose
 * `@portabletext/react` ESM the jest transform cannot load (the paths-mapped
 * ESM gotcha; see document-surface-keys.ts for the same problem solved by a
 * mirror). `analytics.ts` has zero imports — pure data plus one guarded
 * function — so it is re-exported here by relative path into the package
 * SOURCE, the same move `surface-key-parity.test.ts` already makes. One source
 * of truth, no duplicated string literals, and (document) components that fire
 * help events stay loadable under jest.
 */
export {
  HELP_EVENTS,
  safeCapture,
  type HelpEventName,
} from '../../../../../packages/help-system/src/analytics';
