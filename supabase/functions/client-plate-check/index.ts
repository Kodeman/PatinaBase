/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceCaller } from "../board-deck-import-resolve/auth.ts";
import { checkLibraryImage, type LibraryImage, runChecks } from "./lib.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // The gateway validates JWT signatures (verify_jwt=true); opaque secret
  // keys use the existing timing-safe service-caller helper.
  if (
    !isServiceCaller(
      req.headers.get("authorization"),
      Deno.env.get("SUPABASE_SECRET_KEYS"),
    )
  ) {
    return json({ error: "forbidden" }, 403);
  }
  const started = Date.now();
  const hardEnd = AbortSignal.timeout(115_000);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              hardEnd,
              AbortSignal.timeout(5_000),
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      },
    },
  );
  try {
    const { data, error } = await admin.rpc("list_uncopied_library_images", {
      p_limit: 200,
    });
    if (error) throw error;
    const counts = await runChecks((data ?? []) as LibraryImage[], {
      check: (image) => checkLibraryImage(image, supabaseUrl),
      async begin() {
        const { data, error } = await admin.rpc("begin_client_plate_check_run");
        if (error) throw error;
        return data;
      },
      async finish(runId, counts) {
        const { error } = await admin.rpc("finish_client_plate_check_run", {
          p_run_id: runId,
          p_status: counts.errors ? "failed" : "succeeded",
          p_detail: counts,
          p_error: counts.errors ? "library link recording errors" : null,
        });
        if (error) throw error;
      },
      async record(image, dead) {
        const { error } = await admin.rpc("record_library_link_check", {
          p_image_id: image.id,
          p_dead: dead,
        });
        if (error) throw error;
      },
    }, started + 100_000);
    console.log("client-plate-check", JSON.stringify(counts));
    return json(counts, counts.errors ? 500 : 200);
  } catch (error) {
    console.error(
      "client-plate-check failed",
      error instanceof Error ? error.message : String(error),
    );
    return json({ error: "link_check_failed" }, 500);
  }
});
