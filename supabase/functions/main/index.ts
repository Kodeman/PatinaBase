// Legacy multi-function dispatcher retained for migration compatibility.
// Production Strata functions deploy individually through the Supabase CLI.
//
// Kong strips `/functions/v1/` from incoming requests before they hit :9000,
// so the first path segment here is the function name. We spawn a user worker
// for that function directory and forward the request.
//
// Canonical implementation (mirrors the Supabase self-hosted compose example).

import { STATUS_CODE } from "https://deno.land/std@0.220.0/http/status.ts";

console.log("patina edge-runtime main dispatcher started");

// @ts-expect-error — EdgeRuntime globals are injected by the runtime at boot.
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const serviceName = pathParts[0];

  if (!serviceName) {
    return new Response(
      JSON.stringify({ error: "missing function name in path" }),
      {
        status: STATUS_CODE.BadRequest,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const servicePath = `/home/deno/functions/${serviceName}`;
  console.error(`dispatching to ${servicePath}`);

  const createWorker = async () => {
    const envVarsObj = Deno.env.toObject();
    const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);

    // @ts-expect-error — EdgeRuntime is provided by the supabase/edge-runtime host.
    return await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 256,
      workerTimeoutMs: 400 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
      forceCreate: false,
      netAccessDisabled: false,
      cpuTimeSoftLimitMs: 10_000,
      cpuTimeHardLimitMs: 20_000,
    });
  };

  const callWorker = async (): Promise<Response> => {
    try {
      const worker = await createWorker();
      const controller = new AbortController();
      return await worker.fetch(req, { signal: controller.signal });
    } catch (e) {
      // @ts-expect-error — Deno.errors.WorkerRequestCancelled is runtime-injected.
      if (e instanceof Deno.errors.WorkerRequestCancelled) {
        return callWorker();
      }
      console.error("worker error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: msg }), {
        status: STATUS_CODE.InternalServerError,
        headers: { "Content-Type": "application/json" },
      });
    }
  };

  return callWorker();
});
