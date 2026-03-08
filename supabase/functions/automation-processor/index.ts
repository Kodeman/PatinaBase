// Automation Processor Edge Function
// Cron-triggered (every 5 min). Processes active sequence enrollments
// through their automation steps (email, wait, condition, end).
// Self-contained — duplicates essential logic from packages/notifications
// since Edge Functions run in Deno and can't import from node packages.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Types ──────────────────────────────────────────────────────────────

interface SequenceStep {
  type: "email" | "wait" | "condition" | "end";
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
  total_completed: number;
  total_emails_sent: number;
}

interface ProcessResult {
  processed: number;
  errors: number;
  completed: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function calculateNextStepAt(step: SequenceStep, fromDate: Date = new Date()): string {
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

async function evaluateCondition(
  supabase: ReturnType<typeof createClient>,
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

      const { data: events, error } = await supabase
        .from("engagement_events")
        .select("id")
        .eq("user_id", userId)
        .eq("event_name", eventName)
        .limit(1);

      if (error) return false;
      return events !== null && events.length > 0;
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

// ─── Step Processors ────────────────────────────────────────────────────

async function processEmailStep(
  supabase: ReturnType<typeof createClient>,
  enrollment: Enrollment,
  step: SequenceStep,
  sequence: AutomatedSequence,
): Promise<void> {
  const templateId = (step.config.template_id as string) || sequence.name;
  const subject = (step.config.subject as string) || "Update from Patina";

  // Invoke the notification-dispatch Edge Function
  const { error } = await supabase.functions.invoke("notification-dispatch", {
    body: {
      user_id: enrollment.user_id,
      type: "welcome_series",
      channel: "email",
      template_id: templateId,
      data: {
        subject,
        sequence_name: sequence.name,
        sequence_id: sequence.id,
        enrollment_id: enrollment.id,
        step_index: enrollment.current_step,
        ...((step.config.data as Record<string, unknown>) || {}),
      },
    },
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  // Increment total_emails_sent
  await supabase
    .from("automated_sequences")
    .update({ total_emails_sent: (sequence.total_emails_sent || 0) + 1 })
    .eq("id", sequence.id);
}

async function advanceEnrollment(
  supabase: ReturnType<typeof createClient>,
  enrollment: Enrollment,
  steps: SequenceStep[],
  currentStep: SequenceStep,
  stepResult: string,
  jumpToStep?: number,
): Promise<void> {
  const now = new Date().toISOString();
  const nextStepIndex =
    jumpToStep !== undefined ? jumpToStep : enrollment.current_step + 1;

  const historyEntry: StepHistoryEntry = {
    step: enrollment.current_step,
    type: currentStep.type,
    completed_at: now,
    result: stepResult,
  };

  const updatedHistory = [...(enrollment.step_history || []), historyEntry];

  // Check if we've reached the end
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

    // Increment total_completed on the sequence
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

  // Calculate next_step_at based on the upcoming step
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

async function markEnrollmentCompleted(
  supabase: ReturnType<typeof createClient>,
  enrollment: Enrollment,
  sequence: AutomatedSequence,
): Promise<void> {
  const now = new Date().toISOString();

  const historyEntry: StepHistoryEntry = {
    step: enrollment.current_step,
    type: "end",
    completed_at: now,
    result: "completed",
  };

  const updatedHistory = [...(enrollment.step_history || []), historyEntry];

  await supabase
    .from("sequence_enrollments")
    .update({
      status: "completed",
      completed_at: now,
      step_history: updatedHistory,
      next_step_at: null,
    })
    .eq("id", enrollment.id);

  await supabase
    .from("automated_sequences")
    .update({ total_completed: (sequence.total_completed || 0) + 1 })
    .eq("id", sequence.id);
}

// ─── Main Processing ────────────────────────────────────────────────────

async function processEnrollments(
  supabase: ReturnType<typeof createClient>,
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, errors: 0, completed: 0 };

  // Query active enrollments that are due
  const { data: enrollments, error: queryError } = await supabase
    .from("sequence_enrollments")
    .select(
      "id, sequence_id, user_id, current_step, status, step_history, next_step_at, enrolled_at",
    )
    .eq("status", "active")
    .lte("next_step_at", new Date().toISOString())
    .limit(100);

  if (queryError) {
    console.error("[automation-processor] Failed to query enrollments:", queryError);
    return result;
  }

  if (!enrollments || enrollments.length === 0) {
    return result;
  }

  // Process each enrollment
  for (const enrollment of enrollments as Enrollment[]) {
    try {
      // Load the sequence
      const { data: sequence, error: seqError } = await supabase
        .from("automated_sequences")
        .select(
          "id, name, status, steps_json, total_completed, total_emails_sent",
        )
        .eq("id", enrollment.sequence_id)
        .single();

      if (seqError || !sequence) {
        throw new Error(`Sequence not found: ${enrollment.sequence_id}`);
      }

      const seq = sequence as AutomatedSequence;

      // Skip if sequence is no longer active
      if (seq.status !== "active") {
        continue;
      }

      const steps = seq.steps_json;
      const currentStepIndex = enrollment.current_step;

      // Guard: beyond steps array
      if (currentStepIndex >= steps.length) {
        await markEnrollmentCompleted(supabase, enrollment, seq);
        result.processed++;
        result.completed++;
        continue;
      }

      const step = steps[currentStepIndex];
      let stepResult = "processed";

      switch (step.type) {
        case "email": {
          await processEmailStep(supabase, enrollment, step, seq);
          stepResult = "sent";
          break;
        }

        case "wait": {
          stepResult = "waited";
          break;
        }

        case "condition": {
          const condResult = await evaluateCondition(
            supabase,
            enrollment.user_id,
            step.config,
          );

          stepResult = condResult ? "condition_true" : "condition_false";

          if (condResult && typeof step.config.yes_step === "number") {
            await advanceEnrollment(
              supabase,
              enrollment,
              steps,
              step,
              stepResult,
              step.config.yes_step as number,
            );
            result.processed++;
            continue;
          } else if (!condResult && typeof step.config.no_step === "number") {
            await advanceEnrollment(
              supabase,
              enrollment,
              steps,
              step,
              stepResult,
              step.config.no_step as number,
            );
            result.processed++;
            continue;
          }
          break;
        }

        case "end": {
          await markEnrollmentCompleted(supabase, enrollment, seq);
          result.processed++;
          result.completed++;
          continue;
        }

        default: {
          stepResult = "unknown_step_type";
          break;
        }
      }

      // Advance to next step
      await advanceEnrollment(supabase, enrollment, steps, step, stepResult);
      result.processed++;

      // Check if the enrollment is now completed
      if (enrollment.current_step + 1 >= steps.length) {
        result.completed++;
      }
    } catch (err) {
      console.error(
        `[automation-processor] Error processing enrollment ${enrollment.id}:`,
        err instanceof Error ? err.message : err,
      );
      result.errors++;
    }
  }

  return result;
}

// ─── HTTP Handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const stats = await processEnrollments(supabase);

    console.log(
      `[automation-processor] Processed: ${stats.processed}, Errors: ${stats.errors}, Completed: ${stats.completed}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        ...stats,
        checked_at: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[automation-processor] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
