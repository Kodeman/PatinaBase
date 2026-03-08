// Lead Expiration Check Edge Function
// Triggered by external HTTP cron (every 15 min).
// Queries leads approaching their 24hr response deadline and dispatches
// expiration warning notifications at 2hr and 30min thresholds.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Warning thresholds in minutes
const WARNING_THRESHOLDS = [
  { minutes: 120, label: "2 hours" },
  { minutes: 30, label: "30 minutes" },
];

// Window in minutes around each threshold to catch leads (±10 min)
const THRESHOLD_WINDOW = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const now = new Date();
    let totalNotificationsSent = 0;

    for (const threshold of WARNING_THRESHOLDS) {
      // Calculate the time window for this threshold
      // We want leads whose deadline is threshold.minutes from now (±THRESHOLD_WINDOW)
      const targetTime = new Date(
        now.getTime() + threshold.minutes * 60 * 1000
      );
      const windowStart = new Date(
        targetTime.getTime() - THRESHOLD_WINDOW * 60 * 1000
      );
      const windowEnd = new Date(
        targetTime.getTime() + THRESHOLD_WINDOW * 60 * 1000
      );

      // Find leads with deadlines in this window that haven't been warned yet
      const { data: expiringLeads, error: queryError } = await supabase
        .from("leads")
        .select(`
          id,
          designer_id,
          homeowner_id,
          project_type,
          budget_range,
          response_deadline,
          status
        `)
        .in("status", ["new", "viewed"])
        .not("designer_id", "is", null)
        .gte("response_deadline", windowStart.toISOString())
        .lte("response_deadline", windowEnd.toISOString());

      if (queryError) {
        console.error(
          `Error querying leads for ${threshold.label} threshold:`,
          queryError
        );
        continue;
      }

      if (!expiringLeads || expiringLeads.length === 0) {
        continue;
      }

      // Check notification_log to avoid duplicate warnings
      for (const lead of expiringLeads) {
        // Check if we already sent this threshold warning for this lead
        const { count } = await supabase
          .from("notification_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", lead.designer_id)
          .eq("type", "lead_expiring")
          .gte("created_at", new Date(now.getTime() - 30 * 60 * 1000).toISOString())
          .contains("metadata", { leadId: lead.id, threshold: threshold.label });

        if ((count ?? 0) > 0) {
          continue; // Already warned for this threshold
        }

        // Get homeowner name
        const { data: homeowner } = await supabase
          .from("profiles")
          .select("display_name, email")
          .eq("id", lead.homeowner_id)
          .single();

        const clientName =
          homeowner?.display_name || homeowner?.email || "A client";

        // Dispatch notification
        const { error: dispatchError } = await supabase.functions.invoke(
          "notification-dispatch",
          {
            body: {
              user_id: lead.designer_id,
              type: "lead_expiring",
              channel: "email",
              template_id: "lead-expiring",
              data: {
                clientName,
                projectType: lead.project_type,
                budgetRange: lead.budget_range,
                timeRemaining: threshold.label,
                leadId: lead.id,
                threshold: threshold.label,
              },
              priority: "high",
            },
          }
        );

        if (dispatchError) {
          console.error(
            `Failed to dispatch expiration warning for lead ${lead.id}:`,
            dispatchError
          );
        } else {
          totalNotificationsSent++;
        }

        // Also send push notification for 30-minute warning
        if (threshold.minutes === 30) {
          await supabase.functions.invoke("notification-dispatch", {
            body: {
              user_id: lead.designer_id,
              type: "lead_expiring",
              channel: "push",
              template_id: "lead-expiring",
              data: {
                clientName,
                projectType: lead.project_type,
                timeRemaining: threshold.label,
                leadId: lead.id,
                threshold: threshold.label,
              },
              priority: "high",
            },
          });
        }
      }
    }

    // Also expire leads that have passed their deadline
    const { data: expiredLeads, error: expireError } = await supabase
      .from("leads")
      .update({ status: "expired", updated_at: now.toISOString() })
      .in("status", ["new", "viewed"])
      .lt("response_deadline", now.toISOString())
      .select("id");

    const expiredCount = expiredLeads?.length ?? 0;
    if (expireError) {
      console.error("Error expiring leads:", expireError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_sent: totalNotificationsSent,
        leads_expired: expiredCount,
        checked_at: now.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in lead-expiration-check:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
