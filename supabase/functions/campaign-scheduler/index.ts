// Campaign Scheduler Edge Function
// Cron-triggered (every 5 min). Finds scheduled campaigns
// that are due and invokes campaign-dispatch for each.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Find campaigns that are scheduled and due
    const { data: dueCampaigns, error } = await supabase
      .from("campaigns")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString())
      .limit(10);

    if (error) {
      console.error("Error querying scheduled campaigns:", error);
      return new Response(
        JSON.stringify({ error: "Failed to query campaigns" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!dueCampaigns || dueCampaigns.length === 0) {
      return new Response(
        JSON.stringify({ dispatched: 0, checked_at: new Date().toISOString() }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Dispatch each campaign
    const results: Array<{ campaign_id: string; success: boolean; error?: string }> = [];

    for (const campaign of dueCampaigns) {
      try {
        const { error: invokeError } = await supabase.functions.invoke(
          "campaign-dispatch",
          {
            body: { campaign_id: campaign.id },
          }
        );

        results.push({
          campaign_id: campaign.id,
          success: !invokeError,
          error: invokeError?.message,
        });
      } catch (err) {
        results.push({
          campaign_id: campaign.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        dispatched: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
        checked_at: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in campaign-scheduler:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
