/**
 * Studio setup checklist — pure derivation (U3, Wave 1 of the Call Sheet
 * program). Five day-1 steps, each read straight off state that already
 * exists elsewhere — nothing here is a form field or a stored "done" flag.
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
  | 'first-project';

export interface StudioSetupStep {
  key: StudioSetupStepKey;
  label: string;
  done: boolean;
}

export interface StudioSetupInput {
  /** Reserved for future settled-label use; unused today — see settledLabel. */
  orgCreatedAt: string | null;
  myJobTitle: string | null | undefined;
  /** Count of member rows (active or invited) other than the viewer's own. */
  memberCountBeyondSelf: number;
  projectsCount: number;
  /** Wave 2 input — the studio rolodex. Defaults to 0 until it exists. */
  contactsCount?: number;
  /** Wave 2 input — the owner explicitly skipped the seed review. */
  seedSkipped?: boolean;
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
    'crew-invited': input.memberCountBeyondSelf > 0,
    'rolodex-seeded': contactsCount > 0 || seedSkipped,
    'first-project': input.projectsCount > 0,
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
