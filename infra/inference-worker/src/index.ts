import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  INFERENCE: DurableObjectNamespace<InferenceEngine>;
  INFERENCE_TOKEN: string;
}

/**
 * The aesthete-inference container (FastAPI + ONNX, port 8000). The model is
 * baked into the image and loaded once at startup, so all traffic routes to a
 * single warm instance; `sleepAfter` keeps it warm across the aesthete edge
 * functions' bursty calls (embed on capture, nightly taste refit).
 *
 * INFERENCE_TOKEN is forwarded from a Worker secret into the container, where
 * `/embed/*` and `/fit/*` enforce `Authorization: Bearer $INFERENCE_TOKEN`
 * (`/healthz` is open). The Worker forwards requests unchanged, so callers'
 * bearer headers reach the container.
 */
export class InferenceEngine extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = '1h';

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      INFERENCE_TOKEN: env.INFERENCE_TOKEN,
      MODELS_DIR: '/models',
      ORT_INTRA_OP_THREADS: '2',
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Single warm instance — the model load (~90s cold) happens once.
    return getContainer(env.INFERENCE, 'singleton').fetch(request);
  },
};
