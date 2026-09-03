/**
 * Studio setup checklist — pure derivation (U3, Wave 1 of the Call Sheet
 * program). Six day-1 steps, each read straight off state that already
 * exists elsewhere — nothing here is a form field or a stored "done" flag.
 * The sixth row, "first-hire-opened" (L3, 00559), is the checklist's own
 * reading of the moment VISION §2 defines: not that a hire was invited, but
 * that she arrived and opened a document.
 * `contactsCount` / `seedSkipped` describe the studio rolodex, which lands in
 * Wave 2; they default to 0/false so this wave's row 4 renders un-ticked with
 * its SKIP affordance disabled, rather than either lying done or throwing on
 * a missing input.
 *
 * Deliberately dependency-free (mirrors desk-derivation.ts): no design-system
 * import, no @patina/supabase import — callers pass primitives read from
 * whatever hooks they already hold.
 */

export type StudioSetupStepKey =
  | 'named-and-branded'
  | 'own-title-set'
  | 'crew-invited'
  | 'rolodex-seeded'
  | 'first-project'
  | 'first-hire-opened';

export interface StudioSetupStep {
  key: StudioSetupStepKey;
  label: string;
  done: boolean;
}

export interface StudioSetupInput {
  /** Reserved for future settled-label use; unused today — see settledLabel. */
  orgCreatedAt: string | null;
  myJobTitle: string | null | undefined;
  /**
   * Count of ACCEPTED (status === 'active') member rows other than the
   * viewer's own — renamed from `memberCountBeyondSelf` (L3, 00559): "Invite
   * your crew" now fills on acceptance, not on send, so an invited-but-not-
   * yet-accepted row must not count here.
   */
  activeMemberCountBeyondSelf: number;
  projectsCount: number;
  /** Wave 2 input — the studio rolodex. Defaults to 0 until it exists. */
  contactsCount?: number;
  /** Wave 2 input — the owner explicitly skipped the seed review. */
  seedSkipped?: boolean;
  /**
   * Count of non-self, non-owner members whose own
   * `first_document_opened_at` is set (00559) — i.e. how many hires have
   * opened a document. The row ticks on the first one; callers derive this
   * from the same members list as `activeMemberCountBeyondSelf`.
   */
  hiresWithFirstDocument: number;
}

export interface StudioSetupState {
  steps: StudioSetupStep[];
  /** Count of steps not yet done. */
  openCount: number;
  allDone: boolean;
  /** "Set up · <Month Year>" — the collapsed line once every step is done. */
  settledLabel: string;
}

const STEP_LABELS: Record<StudioSetupStepKey, string> = {
  'named-and-branded': 'Name & brand the studio',
  'own-title-set': 'Set your own title',
  'crew-invited': 'Invite your crew',
  'rolodex-seeded': 'Seed the rolodex',
  'first-project': 'Open the first project',
  'first-hire-opened': 'Your first hire opened a document',
};

/**
 * Derives the five day-1 checklist rows from live studio state. `now`
 * defaults to the current time but is injectable so the settled label is
 * testable without mocking the system clock.
 */
export function deriveSetupSteps(
  input: StudioSetupInput,
  now: Date = new Date(),
): StudioSetupState {
  const contactsCount = input.contactsCount ?? 0;
  const seedSkipped = input.seedSkipped ?? false;

  const done: Record<StudioSetupStepKey, boolean> = {
    // A studio row cannot exist without a name — this step is always true.
    'named-and-branded': true,
    'own-title-set': Boolean(input.myJobTitle && input.myJobTitle.trim()),
    'crew-invited': input.activeMemberCountBeyondSelf > 0,
    'rolodex-seeded': contactsCount > 0 || seedSkipped,
    'first-project': input.projectsCount > 0,
    'first-hire-opened': input.hiresWithFirstDocument > 0,
  };

  const steps: StudioSetupStep[] = (
    Object.keys(STEP_LABELS) as StudioSetupStepKey[]
  ).map((key) => ({ key, label: STEP_LABELS[key], done: done[key] }));

  const openCount = steps.filter((s) => !s.done).length;
  const allDone = openCount === 0;
  const settledLabel = `Set up · ${new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(now)}`;

  return { steps, openCount, allDone, settledLabel };
}
