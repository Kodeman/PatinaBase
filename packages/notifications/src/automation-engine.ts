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
      await processEmailStep(supabase, enrollment, step, sequence as AutomatedSequence);
      stepResult = 'sent';
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
): Promise<void> {
  const templateId = (step.config.template_id as string) || sequence.name;
  const subject = (step.config.subject as string) || `Update from Patina`;

  // Invoke the notification-dispatch Edge Function
  const { error } = await supabase.functions.invoke('notification-dispatch', {
    body: {
      user_id: enrollment.user_id,
      type: 'welcome_series',
      channel: 'email',
      template_id: templateId,
      data: {
        subject,
        sequence_name: sequence.name,
        sequence_id: sequence.id,
        enrollment_id: enrollment.id,
        step_index: enrollment.current_step,
        ...(step.config.data as Record<string, unknown> || {}),
      },
    },
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  // Increment total_emails_sent on the sequence
  await supabase
    .from('automated_sequences')
    .update({ total_emails_sent: (sequence.total_emails_sent || 0) + 1 })
    .eq('id', sequence.id);
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
