// field-daily — the once-daily Field Coordination digest cron entry (00284
// schedules it at 13:00 UTC). The orchestration + pure composition live in
// core.ts (so they unit-test without a server); this entry just wires the
// service-role client and invokes runFieldDaily.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runFieldDaily } from "./core.ts";
import { captureServerEvent } from "../_shared/aesthete-events.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const summary = await runFieldDaily(supabase);
    await captureServerEvent("field-daily", "field_daily_run", { ...summary });
    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("field-daily failed:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
