// Pure(ish)-DB-calling helpers for automation-processor, split out of
// index.ts so they can be `deno test`ed without booting the function's
// top-level `Deno.serve` (see the ./index.test.ts header comment, and
// supabase/functions/po-send/index.test.ts for the established pattern in
// this repo).
//
// Kept in sync by hand with the local copies in index.ts of the same shape
// (`SequenceStep`, `StepHistoryEntry`, `Enrollment`, `calculateNextStepAt`)
// — TypeScript structural typing means the two files' identically-shaped
// interfaces interoperate without a shared import, matching this directory's
// existing "self-contained, duplicates on purpose" posture (see index.ts's
// own file-header comment re: packages/notifications).

export interface SequenceStep {
  type: "email" | "wait" | "condition" | "end";
  config: Record<string, unknown>;
}

export interface StepHistoryEntry {
  step: number;
  type: string;
  completed_at: string;
  result: string;
  // Set on a condition-gated email advanced past without sending (00562 —
  // config.condition.negate + config.on_false:'skip'). Absent on every
  // other history entry.
  skipped?: boolean;
  reason?: string;
}

export interface Enrollment {
  id: string;
  sequence_id: string;
  user_id: string;
  current_step: number;
  status: string;
  step_history: StepHistoryEntry[];
  next_step_at: string | null;
  enrolled_at: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export function calculateNextStepAt(step: SequenceStep, fromDate: Date = new Date()): string {
  const config = step.config;
  const delayMs =
    ((config.delay_days as number) || 0) * 86400000 +
    ((config.delay_hours as number) || 0) * 3600000 +
    ((config.delay_minutes as number) || 0) * 60000;

  if (step.type === "wait" && delayMs === 0) {
    return new Date(fromDate.getTime() + 86400000).toISOString();
  }

  if (delayMs > 0) {
    return new Date(fromDate.getTime() + delayMs).toISOString();
  }

  return fromDate.toISOString();
}

// ─── Condition Evaluator ────────────────────────────────────────────────

export async function evaluateCondition(
  supabase: SupabaseLike,
  userId: string,
  condition: Record<string, unknown>,
): Promise<boolean> {
  const conditionType = condition.type as string;

  switch (conditionType) {
    case "user_property": {
      const field = condition.field as string;
      const operator = (condition.operator as string) || "eq";
      const value = condition.value;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select(field)
        .eq("id", userId)
        .single();

      if (error || !profile) return false;

      const fieldValue = profile[field];

      switch (operator) {
        case "eq":
          return fieldValue === value;
        case "neq":
          return fieldValue !== value;
        case "gt":
          return typeof fieldValue === "number" && fieldValue > (value as number);
        case "gte":
          return typeof fieldValue === "number" && fieldValue >= (value as number);
        case "lt":
          return typeof fieldValue === "number" && fieldValue < (value as number);
        case "lte":
          return typeof fieldValue === "number" && fieldValue <= (value as number);
        default:
          return fieldValue === value;
      }
    }

    case "event_occurred": {
      const eventName = condition.event as string;
      // 00562 — condition.negate:true inverts the occurred check so a
      // gate reading `{event_occurred, negate:true}` evaluates true when
      // the event has NOT happened (the ordinary case — send the email)
      // and false once it HAS (skip it — the step runner's on_false:'skip'
      // branch reads this false to advance past the paired email).
      const negate = condition.negate === true;

      const { data: events, error } = await supabase
        .from("engagement_events")
        .select("id")
        .eq("user_id", userId)
        .eq("event_name", eventName)
        .limit(1);

      if (error) return false;
      const occurred = events !== null && events.length > 0;
      return negate ? !occurred : occurred;
    }

    case "time_elapsed": {
      const days = condition.days as number;
      const sinceField = (condition.since as string) || "enrolled_at";

      const { data: enrollment, error } = await supabase
        .from("sequence_enrollments")
        .select(sinceField)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("enrolled_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !enrollment) return false;

      const referenceDate = new Date(enrollment[sinceField] as string);
      const elapsedDays = (Date.now() - referenceDate.getTime()) / 86400000;
      return elapsedDays >= days;
    }

    case "engagement_check": {
      const expectedTier = condition.tier as string | string[];
      const tiers = Array.isArray(expectedTier) ? expectedTier : [expectedTier];

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("engagement_tier")
        .eq("id", userId)
        .single();

      if (error || !profile) return false;
      return tiers.includes(profile.engagement_tier as string);
    }

    default:
      return false;
  }
}

// 00562 — condition-gated skip. A condition step whose config reads
// `{condition: {type:'event_occurred', event, negate:true}, on_false:'skip'}`
// evaluates false once the gated event HAS occurred (evaluateCondition
// applies the negate); that false result routes here instead of the
// ordinary single-step advance. The immediately-following step (the paired
// email, by construction of every steps_json this shape appears in) is
// advanced past WITHOUT being sent — both the condition step and the
// skipped email get their own step_history entry, the email's marked
// `{skipped:true, reason}` so a `step_history` read can tell "never sent"
// apart from "sent".
export async function advanceEnrollmentSkippingNext(
  supabase: SupabaseLike,
  enrollment: Enrollment,
  steps: SequenceStep[],
  conditionStep: SequenceStep,
  conditionStepIndex: number,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  const skippedStepIndex = conditionStepIndex + 1;
  const skippedStep = steps[skippedStepIndex] as SequenceStep | undefined;

  const conditionHistoryEntry: StepHistoryEntry = {
    step: conditionStepIndex,
    type: conditionStep.type,
    completed_at: now,
    result: "condition_false",
  };

  const skippedHistoryEntry: StepHistoryEntry = {
    step: skippedStepIndex,
    type: skippedStep?.type ?? "email",
    completed_at: now,
    result: "skipped",
    skipped: true,
    reason,
  };

  const updatedHistory = [
    ...(enrollment.step_history || []),
    conditionHistoryEntry,
    skippedHistoryEntry,
  ];

  const nextStepIndex = skippedStepIndex + 1;

  if (nextStepIndex >= steps.length) {
    await supabase
      .from("sequence_enrollments")
      .update({
        current_step: nextStepIndex,
        step_history: updatedHistory,
        status: "completed",
        completed_at: now,
        next_step_at: null,
      })
      .eq("id", enrollment.id);

    const { data: seq } = await supabase
      .from("automated_sequences")
      .select("total_completed")
      .eq("id", enrollment.sequence_id)
      .single();

    if (seq) {
      await supabase
        .from("automated_sequences")
        .update({
          total_completed: ((seq as { total_completed: number }).total_completed || 0) + 1,
        })
        .eq("id", enrollment.sequence_id);
    }

    return;
  }

  const nextStep = steps[nextStepIndex];
  const nextStepAt = calculateNextStepAt(nextStep);

  await supabase
    .from("sequence_enrollments")
    .update({
      current_step: nextStepIndex,
      step_history: updatedHistory,
      next_step_at: nextStepAt,
    })
    .eq("id", enrollment.id);
}
