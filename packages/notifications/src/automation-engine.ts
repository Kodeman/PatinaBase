import type { SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProcessResult {
  processed: number;
  errors: number;
  completed: number;
}

interface SequenceStep {
  type: 'email' | 'wait' | 'condition' | 'end';
  config: Record<string, unknown>;
}

interface StepHistoryEntry {
  step: number;
  type: string;
  completed_at: string;
  result: string;
}

interface Enrollment {
  id: string;
  sequence_id: string;
  user_id: string;
  current_step: number;
  status: string;
  step_history: StepHistoryEntry[];
  next_step_at: string | null;
  enrolled_at: string;
}

interface AutomatedSequence {
  id: string;
  name: string;
  status: string;
  steps_json: SequenceStep[];
  total_enrolled: number;
  total_completed: number;
  total_emails_sent: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate the next_step_at timestamp based on a wait step's delay configuration.
 * Supports `delay_days`, `delay_hours`, and `delay_minutes` in the step config.
 * Defaults to 1 day if no delay config is present.
 */
function calculateNextStepAt(step: SequenceStep, fromDate: Date = new Date()): string {
  const config = step.config;
  const delayMs =
    ((config.delay_days as number) || 0) * 86400000 +
    ((config.delay_hours as number) || 0) * 3600000 +
    ((config.delay_minutes as number) || 0) * 60000;

  // If the step is a wait step with no explicit delay, default to 1 day
  // For email/condition/end steps, process immediately
  if (step.type === 'wait' && delayMs === 0) {
    return new Date(fromDate.getTime() + 86400000).toISOString();
  }

  if (delayMs > 0) {
    return new Date(fromDate.getTime() + delayMs).toISOString();
  }

  // Immediate processing for non-wait steps
  return fromDate.toISOString();
}

/**
 * Calculate the next_step_at for the initial enrollment based on the first step.
 * Email steps scheduled from a sequence's delay_days config on the step.
 */
function calculateInitialNextStepAt(step: SequenceStep): string {
  if (step.type === 'wait') {
    return calculateNextStepAt(step);
  }

  // For email steps, check if there's a delay_days on the step
  if (step.type === 'email') {
    const delayDays = (step.config.delay_days as number) || 0;
    if (delayDays > 0) {
      return new Date(Date.now() + delayDays * 86400000).toISOString();
    }
  }

  // Process immediately
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE GATES (mirrored in supabase/functions/automation-processor)
// ═══════════════════════════════════════════════════════════════════════════
// Behavior-aware drip guards: preference opt-out, business-hours send window,
// and a 24h anti-fatigue spacing rule. Keep these IN SYNC with the edge mirror.

const DAY_MS = 86400000;
const SEND_WINDOW_TZ = 'America/Chicago';
const SEND_WINDOW_OPEN_HOUR = 8; // 08:00
const SEND_WINDOW_CLOSE_HOUR = 17; // 17:00

/** Chicago wall-clock Y/M/D + H/M for an instant (Intl, no dependencies). */
function chicagoParts(
  date: Date,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SEND_WINDOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = parseInt(part.value, 10);
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  return { year: map.year, month: map.month, day: map.day, hour, minute: map.minute };
}

/** Milliseconds Chicago wall-clock is ahead of UTC at `date` (negative). */
function chicagoOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SEND_WINDOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = parseInt(part.value, 10);
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUtc - date.getTime();
}

/** UTC instant whose Chicago wall clock is the given Y/M/D H:M (DST-safe). */
function chicagoWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = chicagoOffsetMs(new Date(guess));
  let result = new Date(guess - offset);
  const offset2 = chicagoOffsetMs(result);
  if (offset2 !== offset) result = new Date(guess - offset2);
  return result;
}

/** True if `now` is Mon–Fri 08:00–17:00 America/Chicago. */
export function isWithinSendWindow(now: Date): boolean {
  const p = chicagoParts(now);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0=Sun..6=Sat
  const isWeekday = weekday >= 1 && weekday <= 5;
  return isWeekday && p.hour >= SEND_WINDOW_OPEN_HOUR && p.hour < SEND_WINDOW_CLOSE_HOUR;
}

/** ISO of the next Mon–Fri 08:00 America/Chicago opening strictly after `now`. */
export function nextSendWindowOpening(now: Date): string {
  const start = chicagoParts(now);
  for (let addDays = 0; addDays <= 8; addDays++) {
    const base = new Date(Date.UTC(start.year, start.month - 1, start.day));
    base.setUTCDate(base.getUTCDate() + addDays);
    const weekday = base.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // skip Sat/Sun
    const opening = chicagoWallClockToUtc(
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
      SEND_WINDOW_OPEN_HOUR,
      0,
    );
    if (opening.getTime() > now.getTime()) return opening.toISOString();
  }
  return new Date(now.getTime() + 3600000).toISOString();
}

/**
 * Preference gate: false ⇒ the onboarding drip must stop for this user.
 * Defensive — a missing preferences row OR a not-yet-migrated column reads as
 * allow (00290 ships type_onboarding NOT NULL DEFAULT true).
 */
async function isOnboardingEmailAllowed(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!prefs) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prefs as Record<string, any>;
  if (p.channels_email === false) return false;
  if (p.type_onboarding === false) return false;
  return true;
}

/**
 * 24h spacing guard: returns the ISO send-time of the most recent successfully
 * sent sequence/engagement email to this user within the last 24h, or null.
 */
async function findRecentSequenceSend(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const cutoff = new Date(Date.now() - DAY_MS).toISOString();
  const { data, error } = await supabase
    .from('notification_log')
    .select('sent_at, created_at, metadata')
    .eq('user_id', userId)
    .eq('channel', 'email')
    .in('status', ['delivered', 'sending', 'opened', 'clicked'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error || !data || !Array.isArray(data)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data as Array<Record<string, any>>) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const isSequence = meta.sequence_id != null || meta.category === 'engagement';
    if (isSequence) {
      return (row.sent_at as string) || (row.created_at as string) || null;
    }
  }
  return null;
}

type EmailStepOutcome =
  | { action: 'unsubscribed' }
  | { action: 'deferred' }
  | { action: 'advance'; result: string };

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 3B — enrichment, firsts-summary retrospective, paired in-app nudge
// ═══════════════════════════════════════════════════════════════════════════
// Mirrored in supabase/functions/automation-processor. Keep IN SYNC with the
// edge mirror.

/** Base URL for {{app_url}} interpolation + template data. */
function getAppUrl(): string {
  return process.env.DESIGNER_PORTAL_URL || 'https://app.patina.cloud';
}

/**
 * First name for `{{first_name}}` greetings: the first whitespace-separated
 * token of profiles.display_name. Falls back to the literal "there" (so the
 * greeting renders "there,") when the profile has no usable display name.
 * Fetched once per email step — never per compliance gate.
 */
async function fetchFirstName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const displayName = (profile as any)?.display_name as string | null | undefined;
  if (displayName && displayName.trim().length > 0) {
    return displayName.trim().split(/\s+/)[0];
  }
  return 'there';
}

// Plain-English phrase per activation milestone (00291 event_name → sentence
// fragment). Fragments are lowercase-initial; the assembled sentence gets its
// first letter capitalized and a trailing period.
const FIRSTS_PHRASES: Record<string, (date: string) => string> = {
  designer_first_signin: (d) => `you signed in on ${d}`,
  project_created: (d) => `you started your first project on ${d}`,
  first_capture: (d) => `your first capture landed ${d}`,
  client_added: (d) => `you added your first client on ${d}`,
  proposal_created: (d) => `you drafted your first proposal on ${d}`,
  proposal_sent: (d) => `your first proposal went out ${d}`,
  proposal_signed: (d) => `your first proposal was signed on ${d}`,
  design_request_claimed: (d) => `you claimed your first request on ${d}`,
  hours_logged: (d) => `you logged your first hours on ${d}`,
  invoice_sent: (d) => `you sent your first invoice on ${d}`,
  payment_received: (d) => `your first payment came in on ${d}`,
};

// Funnel weight (higher = later / more meaningful). When a designer has more
// than FIRSTS_MAX firsts, we keep the highest-weighted ones, then render them
// back in chronological order so the summary still reads as a timeline.
const FIRSTS_FUNNEL_WEIGHT: Record<string, number> = {
  designer_first_signin: 1,
  project_created: 2,
  first_capture: 3,
  client_added: 4,
  proposal_created: 5,
  proposal_sent: 6,
  proposal_signed: 7,
  design_request_claimed: 8,
  hours_logged: 9,
  invoice_sent: 10,
  payment_received: 11,
};

const FIRSTS_MAX = 6;
const FIRSTS_FALLBACK = 'You set up your desk — the rest is ahead of you.';

/** "June 3" — America/Chicago wall-clock month + day (no year). */
function humanizeFirstsDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SEND_WINDOW_TZ,
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

/**
 * Build the plain-English "firsts" retrospective for the six-weeks email.
 * Reads first-occurrence activation events (00291: posthog_event_id LIKE
 * 'activation:%'), keeps the known milestones, caps at the FIRSTS_MAX most
 * meaningful (later-funnel wins), and renders a semicolon-joined timeline.
 * Falls back to a single graceful sentence when the only milestone is the
 * sign-in (or none exist at all).
 */
async function buildFirstsSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('engagement_events')
    .select('event_name, created_at, posthog_event_id')
    .eq('user_id', userId)
    .like('posthog_event_id', 'activation:%')
    .order('created_at', { ascending: true });

  const rows = (!error && Array.isArray(data) ? data : []) as Array<{
    event_name?: string;
    created_at?: string;
  }>;

  // First occurrence of each known milestone, in chronological order.
  const seen = new Set<string>();
  const known: Array<{ event: string; createdAt: string }> = [];
  for (const row of rows) {
    const event = row.event_name;
    const createdAt = row.created_at;
    if (!event || !createdAt || !(event in FIRSTS_PHRASES) || seen.has(event)) continue;
    seen.add(event);
    known.push({ event, createdAt });
  }

  if (
    known.length === 0 ||
    (known.length === 1 && known[0].event === 'designer_first_signin')
  ) {
    return FIRSTS_FALLBACK;
  }

  let selected = known;
  if (known.length > FIRSTS_MAX) {
    selected = [...known]
      .sort(
        (a, b) =>
          (FIRSTS_FUNNEL_WEIGHT[b.event] ?? 0) - (FIRSTS_FUNNEL_WEIGHT[a.event] ?? 0),
      )
      .slice(0, FIRSTS_MAX)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const phrases = selected.map(({ event, createdAt }) =>
    FIRSTS_PHRASES[event](humanizeFirstsDate(createdAt)),
  );
  let sentence = phrases.join('; ');
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (!sentence.endsWith('.')) sentence += '.';
  return sentence;
}

/**
 * Fire the paired in-app nudge after a real email send. Best-effort: a skipped
 * or failed dispatch here never fails the email step (the email already went).
 * deep_link's literal `{{app_url}}` token is interpolated with the same app_url
 * used in the email's template data. The `data` shape (headline / message /
 * deep_link) is exactly what the designer-portal inbox hook renders
 * (packages/supabase/src/hooks/use-inbox.ts InboxNotificationMetadata) — the
 * notification-dispatch in_app branch stores `data` verbatim as the log row's
 * metadata.
 */
async function sendInAppNudge(
  supabase: SupabaseClient,
  userId: string,
  templateId: string,
  inApp: { headline?: unknown; message?: unknown; deep_link?: unknown },
  appUrl: string,
): Promise<void> {
  try {
    const data: Record<string, unknown> = {};
    if (inApp.headline !== undefined) data.headline = inApp.headline;
    if (inApp.message !== undefined) data.message = inApp.message;
    if (typeof inApp.deep_link === 'string') {
      data.deep_link = inApp.deep_link.replace(/\{\{app_url\}\}/g, appUrl);
    } else if (inApp.deep_link !== undefined) {
      data.deep_link = inApp.deep_link;
    }

    const { data: resp, error } = await supabase.functions.invoke(
      'notification-dispatch',
      {
        body: {
          user_id: userId,
          type: 'welcome_series',
          channel: 'in_app',
          template_id: templateId,
          data,
        },
      },
    );

    if (error) {
      console.error(
        '[automation-engine] in-app nudge dispatch error:',
        (error as { message?: string }).message ?? error,
      );
      return;
    }
    if ((resp as { skipped?: boolean } | null)?.skipped === true) {
      console.log('[automation-engine] in-app nudge skipped (dispatch suppressed)');
    }
  } catch (err) {
    console.error(
      '[automation-engine] in-app nudge failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate a condition step. Supports four condition types:
 * - `user_property`: Check a profile field against a value (supports operators: eq, gt, gte, lt, lte, neq)
 * - `event_occurred`: Check if a specific event exists in engagement_events for the user
 * - `time_elapsed`: Check if N days have passed since the user's enrollment
 * - `engagement_check`: Check engagement tier against expected value(s)
 */
export async function evaluateCondition(
  supabase: SupabaseClient,
  userId: string,
  condition: Record<string, unknown>,
): Promise<boolean> {
  const conditionType = condition.type as string;

  switch (conditionType) {
    case 'user_property': {
      const field = condition.field as string;
      const operator = (condition.operator as string) || 'eq';
      const value = condition.value;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select(field)
        .eq('id', userId)
        .single();

      if (error || !profile) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fieldValue = (profile as any)[field];

      switch (operator) {
        case 'eq':
          return fieldValue === value;
        case 'neq':
          return fieldValue !== value;
        case 'gt':
          return typeof fieldValue === 'number' && fieldValue > (value as number);
        case 'gte':
          return typeof fieldValue === 'number' && fieldValue >= (value as number);
        case 'lt':
          return typeof fieldValue === 'number' && fieldValue < (value as number);
        case 'lte':
          return typeof fieldValue === 'number' && fieldValue <= (value as number);
        default:
          return fieldValue === value;
      }
    }

    case 'event_occurred': {
      const eventName = condition.event as string;

      const { data: events, error } = await supabase
        .from('engagement_events')
        .select('id')
        .eq('user_id', userId)
        .eq('event_name', eventName)
        .limit(1);

      if (error) return false;

      return events !== null && events.length > 0;
    }

    case 'time_elapsed': {
      const days = condition.days as number;
      const sinceField = (condition.since as string) || 'enrolled_at';

      // Look up the enrollment to get the reference date
      const { data: enrollment, error } = await supabase
        .from('sequence_enrollments')
        .select(sinceField)
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !enrollment) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const referenceDate = new Date((enrollment as any)[sinceField] as string);
      const elapsed = Date.now() - referenceDate.getTime();
      const elapsedDays = elapsed / 86400000;

      return elapsedDays >= days;
    }

    case 'engagement_check': {
      const expectedTier = condition.tier as string | string[];
      const tiers = Array.isArray(expectedTier) ? expectedTier : [expectedTier];

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('engagement_tier')
        .eq('id', userId)
        .single();

      if (error || !profile) return false;

      return tiers.includes(profile.engagement_tier as string);
    }

    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENROLLMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enroll a user into an automated sequence.
 *
 * - Checks if the user is already actively enrolled (prevents duplicates)
 * - Inserts a new enrollment with current_step=0
 * - Calculates next_step_at based on the first step
 * - Increments the sequence's total_enrolled counter
 */
export async function enrollUser(
  supabase: SupabaseClient,
  sequenceId: string,
  userId: string,
): Promise<void> {
  // Check for existing active enrollment
  const { data: existing, error: checkError } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .eq('sequence_id', sequenceId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);

  if (checkError) {
    throw new Error(`Failed to check existing enrollment: ${checkError.message}`);
  }

  if (existing && existing.length > 0) {
    throw new Error('User is already enrolled in this sequence');
  }

  // Load the sequence to get its steps
  const { data: sequence, error: seqError } = await supabase
    .from('automated_sequences')
    .select('id, steps_json, total_enrolled')
    .eq('id', sequenceId)
    .single();

  if (seqError || !sequence) {
    throw new Error(`Sequence not found: ${seqError?.message || 'unknown'}`);
  }

  const steps = sequence.steps_json as SequenceStep[];
  if (!steps || steps.length === 0) {
    throw new Error('Sequence has no steps defined');
  }

  // Calculate next_step_at from the first step
  const nextStepAt = calculateInitialNextStepAt(steps[0]);

  // Insert enrollment
  const { error: insertError } = await supabase
    .from('sequence_enrollments')
    .insert({
      sequence_id: sequenceId,
      user_id: userId,
      current_step: 0,
      status: 'active',
      enrolled_at: new Date().toISOString(),
      step_history: [],
      next_step_at: nextStepAt,
    });

  if (insertError) {
    throw new Error(`Failed to create enrollment: ${insertError.message}`);
  }

  // Increment total_enrolled counter
  const { error: updateError } = await supabase
    .from('automated_sequences')
    .update({ total_enrolled: (sequence.total_enrolled || 0) + 1 })
    .eq('id', sequenceId);

  if (updateError) {
    console.error(`[automation-engine] Failed to increment total_enrolled: ${updateError.message}`);
  }
}

/**
 * Unenroll a user from a sequence by marking the enrollment as 'unsubscribed'.
 */
export async function unenrollUser(
  supabase: SupabaseClient,
  enrollmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('sequence_enrollments')
    .update({ status: 'unsubscribed' })
    .eq('id', enrollmentId);

  if (error) {
    throw new Error(`Failed to unenroll user: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PROCESSING LOOP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process all active enrollments that have a due next_step_at.
 *
 * Called by cron every 5 minutes. For each enrollment:
 * 1. Loads the associated automated_sequence
 * 2. Gets the current step from steps_json
 * 3. Processes the step based on type (email, wait, condition, end)
 * 4. Advances the enrollment to the next step
 * 5. Marks enrollment completed when all steps are done
 */
export async function processEnrollments(
  supabase: SupabaseClient,
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, errors: 0, completed: 0 };

  // 1. Query active enrollments that are due
  const { data: enrollments, error: queryError } = await supabase
    .from('sequence_enrollments')
    .select('id, sequence_id, user_id, current_step, status, step_history, next_step_at, enrolled_at')
    .eq('status', 'active')
    .lte('next_step_at', new Date().toISOString())
    .limit(100);

  if (queryError) {
    console.error('[automation-engine] Failed to query enrollments:', queryError);
    return result;
  }

  if (!enrollments || enrollments.length === 0) {
    return result;
  }

  // 2. Process each enrollment
  for (const enrollment of enrollments as Enrollment[]) {
    try {
      await processOneEnrollment(supabase, enrollment);
      result.processed++;
    } catch (err) {
      console.error(
        `[automation-engine] Error processing enrollment ${enrollment.id}:`,
        err instanceof Error ? err.message : err,
      );
      result.errors++;
    }
  }

  // Count completions (re-query to see which were completed during this run)
  const completedIds = (enrollments as Enrollment[]).map((e) => e.id);
  const { data: completedRows } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .in('id', completedIds)
    .eq('status', 'completed');

  result.completed = completedRows?.length ?? 0;

  return result;
}

/**
 * Process a single enrollment through its current step.
 */
async function processOneEnrollment(
  supabase: SupabaseClient,
  enrollment: Enrollment,
): Promise<void> {
  // Load the sequence
  const { data: sequence, error: seqError } = await supabase
    .from('automated_sequences')
    .select('id, name, status, steps_json, total_completed, total_emails_sent')
    .eq('id', enrollment.sequence_id)
    .single();

  if (seqError || !sequence) {
    throw new Error(`Sequence not found: ${enrollment.sequence_id}`);
  }

  // Skip if sequence is no longer active
  if ((sequence as AutomatedSequence).status !== 'active') {
    return;
  }

  const steps = (sequence as AutomatedSequence).steps_json;
  const currentStepIndex = enrollment.current_step;

  // Guard: if current_step is beyond the steps array, mark completed
  if (currentStepIndex >= steps.length) {
    await markEnrollmentCompleted(supabase, enrollment, sequence as AutomatedSequence);
    return;
  }

  const step = steps[currentStepIndex];
  let stepResult = 'processed';

  // Process based on step type
  switch (step.type) {
    case 'email': {
      const outcome = await processEmailStep(supabase, enrollment, step, sequence as AutomatedSequence);
      // Unsubscribe ends the enrollment; deferral just reschedules next_step_at —
      // both are terminal for this run (no advance).
      if (outcome.action === 'unsubscribed' || outcome.action === 'deferred') {
        return;
      }
      stepResult = outcome.result;
      break;
    }

    case 'wait': {
      // Wait steps just advance — the delay was already encoded in next_step_at
      stepResult = 'waited';
      break;
    }

    case 'condition': {
      const conditionResult = await evaluateCondition(
        supabase,
        enrollment.user_id,
        step.config,
      );

      stepResult = conditionResult ? 'condition_true' : 'condition_false';

      // If condition has branching (yes_step / no_step), jump to that step
      if (conditionResult && typeof step.config.yes_step === 'number') {
        await advanceEnrollment(supabase, enrollment, steps, step, stepResult, step.config.yes_step as number);
        return;
      } else if (!conditionResult && typeof step.config.no_step === 'number') {
        await advanceEnrollment(supabase, enrollment, steps, step, stepResult, step.config.no_step as number);
        return;
      }
      // If no branching, just advance to next step
      break;
    }

    case 'end': {
      await markEnrollmentCompleted(supabase, enrollment, sequence as AutomatedSequence);
      return;
    }

    default: {
      stepResult = 'unknown_step_type';
      break;
    }
  }

  // Advance to the next step
  await advanceEnrollment(supabase, enrollment, steps, step, stepResult);
}

/**
 * Send an email for an email step by invoking the notification-dispatch Edge Function.
 */
async function processEmailStep(
  supabase: SupabaseClient,
  enrollment: Enrollment,
  step: SequenceStep,
  sequence: AutomatedSequence,
): Promise<EmailStepOutcome> {
  // 1. Preference gate — unsubscribe stops the whole enrollment.
  const allowed = await isOnboardingEmailAllowed(supabase, enrollment.user_id);
  if (!allowed) {
    await supabase
      .from('sequence_enrollments')
      .update({ status: 'unsubscribed', next_step_at: null })
      .eq('id', enrollment.id);
    return { action: 'unsubscribed' };
  }

  // 2. Send-window guard — no 3am-Sunday sends (opt out via send_window: 'none').
  if (step.config.send_window !== 'none') {
    const now = new Date();
    if (!isWithinSendWindow(now)) {
      await supabase
        .from('sequence_enrollments')
        .update({ next_step_at: nextSendWindowOpening(now) })
        .eq('id', enrollment.id);
      return { action: 'deferred' };
    }
  }

  // 3. 24h spacing guard — defer if we already emailed this user < 24h ago.
  const recentSendAt = await findRecentSequenceSend(supabase, enrollment.user_id);
  if (recentSendAt) {
    const deferUntil = new Date(new Date(recentSendAt).getTime() + DAY_MS).toISOString();
    await supabase
      .from('sequence_enrollments')
      .update({ next_step_at: deferUntil })
      .eq('id', enrollment.id);
    return { action: 'deferred' };
  }

  const templateId = (step.config.template_id as string) || sequence.name;
  const subject = (step.config.subject as string) || `Update from Patina`;

  // Wave 3b — template-variable enrichment. Fetch the profile ONCE here (not
  // per compliance gate) for the {{first_name}} greeting; app_url powers
  // {{app_url}} links and the in-app deep-link interpolation below.
  const appUrl = getAppUrl();
  const firstName = await fetchFirstName(supabase, enrollment.user_id);

  // Wave 3b — the six-weeks retrospective. Only an include_firsts_summary step
  // pays for the engagement_events query.
  const firstsSummary =
    step.config.include_firsts_summary === true
      ? await buildFirstsSummary(supabase, enrollment.user_id)
      : undefined;

  // Invoke the notification-dispatch Edge Function
  const { data, error } = await supabase.functions.invoke('notification-dispatch', {
    body: {
      user_id: enrollment.user_id,
      type: 'welcome_series',
      channel: 'email',
      template_id: templateId,
      data: {
        subject,
        sequence_name: sequence.name,
        // Send-tagging (Wave 3b #4): sequence_id + step_index ride the payload
        // → notification-dispatch forwards data verbatim into the
        // notification_log metadata (sendCompliantEmail metadata param), so the
        // Resend webhook can segment opens/clicks by drip step.
        sequence_id: sequence.id,
        enrollment_id: enrollment.id,
        step_index: enrollment.current_step,
        app_url: appUrl,
        first_name: firstName,
        ...(firstsSummary !== undefined ? { firsts_summary: firstsSummary } : {}),
        ...(step.config.data as Record<string, unknown> || {}),
      },
    },
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  // Dispatch skipped (suppressed / rate-capped / prefs): count as step-completed
  // and advance — do NOT credit total_emails_sent (nothing was sent). No paired
  // in-app nudge either: the email never went out.
  const skipped = (data as { skipped?: boolean; reason?: string } | null)?.skipped === true;
  if (skipped) {
    const reason = (data as { reason?: string }).reason || 'unknown';
    return { action: 'advance', result: `skipped:${reason}` };
  }

  // Increment total_emails_sent on the sequence
  await supabase
    .from('automated_sequences')
    .update({ total_emails_sent: (sequence.total_emails_sent || 0) + 1 })
    .eq('id', sequence.id);

  // Wave 3b — paired in-app nudge, only after a REAL send. Best-effort: a
  // skipped/failed nudge dispatch must never fail the step (the email is out).
  const inApp = step.config.in_app;
  if (inApp && typeof inApp === 'object') {
    await sendInAppNudge(
      supabase,
      enrollment.user_id,
      templateId,
      inApp as { headline?: unknown; message?: unknown; deep_link?: unknown },
      appUrl,
    );
  }

  return { action: 'advance', result: 'sent' };
}

/**
 * Advance an enrollment to the next step, updating step_history and next_step_at.
 * Optionally jump to a specific step (for condition branching).
 */
async function advanceEnrollment(
  supabase: SupabaseClient,
  enrollment: Enrollment,
  steps: SequenceStep[],
  currentStep: SequenceStep,
  stepResult: string,
  jumpToStep?: number,
): Promise<void> {
  const now = new Date().toISOString();
  const nextStepIndex = jumpToStep !== undefined ? jumpToStep : enrollment.current_step + 1;

  // Add to step history
  const historyEntry: StepHistoryEntry = {
    step: enrollment.current_step,
    type: currentStep.type,
    completed_at: now,
    result: stepResult,
  };

  const updatedHistory = [...(enrollment.step_history || []), historyEntry];

  // Check if we've reached the end
  if (nextStepIndex >= steps.length) {
    // Mark as completed
    const { error } = await supabase
      .from('sequence_enrollments')
      .update({
        current_step: nextStepIndex,
        step_history: updatedHistory,
        status: 'completed',
        completed_at: now,
        next_step_at: null,
      })
      .eq('id', enrollment.id);

    if (error) {
      throw new Error(`Failed to complete enrollment: ${error.message}`);
    }

    // Increment total_completed on the sequence
    const { data: seq } = await supabase
      .from('automated_sequences')
      .select('total_completed')
      .eq('id', enrollment.sequence_id)
      .single();

    if (seq) {
      await supabase
        .from('automated_sequences')
        .update({ total_completed: ((seq as { total_completed: number }).total_completed || 0) + 1 })
        .eq('id', enrollment.sequence_id);
    }

    return;
  }

  // Calculate next_step_at based on the upcoming step
  const nextStep = steps[nextStepIndex];
  const nextStepAt = calculateNextStepAt(nextStep);

  const { error } = await supabase
    .from('sequence_enrollments')
    .update({
      current_step: nextStepIndex,
      step_history: updatedHistory,
      next_step_at: nextStepAt,
    })
    .eq('id', enrollment.id);

  if (error) {
    throw new Error(`Failed to advance enrollment: ${error.message}`);
  }
}

/**
 * Mark an enrollment as completed and update the sequence counter.
 */
async function markEnrollmentCompleted(
  supabase: SupabaseClient,
  enrollment: Enrollment,
  sequence: AutomatedSequence,
): Promise<void> {
  const now = new Date().toISOString();

  const historyEntry: StepHistoryEntry = {
    step: enrollment.current_step,
    type: 'end',
    completed_at: now,
    result: 'completed',
  };

  const updatedHistory = [...(enrollment.step_history || []), historyEntry];

  const { error } = await supabase
    .from('sequence_enrollments')
    .update({
      status: 'completed',
      completed_at: now,
      step_history: updatedHistory,
      next_step_at: null,
    })
    .eq('id', enrollment.id);

  if (error) {
    throw new Error(`Failed to mark enrollment completed: ${error.message}`);
  }

  // Increment total_completed
  await supabase
    .from('automated_sequences')
    .update({ total_completed: (sequence.total_completed || 0) + 1 })
    .eq('id', sequence.id);
}
