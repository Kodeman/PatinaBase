// A/B Winner Evaluator — Edge Function
// Cron-triggered hourly. Finds campaigns where ab_enabled=true,
// ab_winner is still NULL, and the evaluation window (default 2h after
// sent_at) has elapsed. Compares variant A vs B by open+click rate on
// notification_log entries tagged with metadata.ab_variant, and writes
// the winner back to campaigns.ab_winner / ab_decided_at.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_EVAL_DELAY_HOURS = 2;

interface CampaignRow {
  id: string;
  subject: string;
  ab_subject_b: string | null;
  ab_split_pct: number | null;
  sent_at: string | null;
}

async function evaluate(
  supabase: ReturnType<typeof createClient>,
  campaign: CampaignRow,
): Promise<{ winner: "a" | "b"; openRateA: number; openRateB: number; sentA: number; sentB: number }> {
  const [{ count: sentA }, { count: openedA }, { count: sentB }, { count: openedB }] =
    await Promise.all([
      supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>campaign_id", campaign.id)
        .eq("metadata->>ab_variant", "a"),
      supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>campaign_id", campaign.id)
        .eq("metadata->>ab_variant", "a")
        .in("status", ["opened", "clicked"]),
      supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>campaign_id", campaign.id)
        .eq("metadata->>ab_variant", "b"),
      supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>campaign_id", campaign.id)
        .eq("metadata->>ab_variant", "b")
        .in("status", ["opened", "clicked"]),
    ]);

  const totalA = sentA ?? 0;
  const totalB = sentB ?? 0;
  const openRateA = totalA > 0 ? ((openedA ?? 0) / totalA) * 100 : 0;
  const openRateB = totalB > 0 ? ((openedB ?? 0) / totalB) * 100 : 0;
  // Tie-breaker: prefer variant A (the original) on a tie so authors can
  // decide intentionally rather than getting random outcomes.
  const winner: "a" | "b" = openRateA >= openRateB ? "a" : "b";

  return { winner, openRateA, openRateB, sentA: totalA, sentB: totalB };
}

async function evaluateDueCampaigns(
  supabase: ReturnType<typeof createClient>,
): Promise<{ scanned: number; decided: number; skipped: number; errors: number }> {
  const stats = { scanned: 0, decided: 0, skipped: 0, errors: 0 };
  const evalDelayHours =
    Number(Deno.env.get("AB_EVAL_DELAY_HOURS")) || DEFAULT_EVAL_DELAY_HOURS;
  const cutoff = new Date(Date.now() - evalDelayHours * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, subject, ab_subject_b, ab_split_pct, sent_at")
    .eq("ab_enabled", true)
    .is("ab_winner", null)
    .not("sent_at", "is", null)
    .lt("sent_at", cutoff)
    .limit(50);

  if (error) {
    console.error("[ab-winner-evaluator] query failed:", error);
    return stats;
  }
  const campaigns = (data ?? []) as CampaignRow[];
  stats.scanned = campaigns.length;

  for (const c of campaigns) {
    try {
      const result = await evaluate(supabase, c);
      // Only commit a winner if at least a few sends per variant exist —
      // otherwise we'd "decide" on a sample of zero.
      if (result.sentA < 5 || result.sentB < 5) {
        stats.skipped++;
        continue;
      }
      const { error: updateErr } = await supabase
        .from("campaigns")
        .update({
          ab_winner: result.winner,
          ab_decided_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      if (updateErr) {
        console.error(
          `[ab-winner-evaluator] update failed for ${c.id}:`,
          updateErr,
        );
        stats.errors++;
        continue;
      }
      stats.decided++;
      console.log(
        `[ab-winner-evaluator] campaign ${c.id}: variant ${result.winner} won (A=${result.openRateA.toFixed(1)}%, B=${result.openRateB.toFixed(1)}%, n=${result.sentA + result.sentB})`,
      );
    } catch (err) {
      stats.errors++;
      console.error(
        `[ab-winner-evaluator] evaluation failed for ${c.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const stats = await evaluateDueCampaigns(supabase);
    console.log(
      `[ab-winner-evaluator] scanned=${stats.scanned} decided=${stats.decided} skipped=${stats.skipped} errors=${stats.errors}`,
    );
    return new Response(
      JSON.stringify({ success: true, ...stats, checked_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ab-winner-evaluator] fatal error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
