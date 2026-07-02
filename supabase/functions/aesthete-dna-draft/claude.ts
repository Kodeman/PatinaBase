// Anthropic Messages API adapter for aesthete-dna-draft (Wave 2C).
//
// Wraps the official @anthropic-ai/sdk behind the ClaudeCaller port defined
// in ./lib.ts so the pass logic stays dependency-free; the mocked suite
// injects fixture callers and only the gated real-API smoke imports this
// module (dynamically).
//
// §12.5: ANTHROPIC_API_KEY is an edge-function secret only — never logged,
// never persisted; the spend ledger bounds the blast radius of a leak.

// deno-lint-ignore-file no-explicit-any

// npm: specifier — the SDK's official Deno path, and the only import form
// the Supabase edge runtime boots cleanly (esm.sh's node-fetch type headers
// fail its graph resolution; stripe-webhook is the in-repo npm: precedent).
// This module is deliberately OUTSIDE the deno-test graph: the mocked suite
// injects fixture callers and smoke.test.ts imports this via a computed
// specifier — because the monorepo root package.json puts repo-root deno
// into manual-node_modules mode, where npm: refuses to resolve (run the
// smoke with DENO_NO_PACKAGE_JSON=1, see README).
import Anthropic from 'npm:@anthropic-ai/sdk@0.109.1';
import type { ClaudeCaller, ModelResponse } from './lib.ts';

/** Per-call timeout + retry posture sized for the 60 s pg_net window:
 * maxRetries 1 keeps a flaky call from eating the whole invocation; the
 * 00241 queue backoff (1 m / 5 m / 25 m) is the durable retry layer. */
const CALL_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

export function createClaudeCaller(apiKey: string): ClaudeCaller {
  const client = new Anthropic({
    apiKey,
    timeout: CALL_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  return async (params: Record<string, unknown>): Promise<ModelResponse> => {
    const response = await client.messages.create(params as any);
    return {
      stop_reason: (response as any).stop_reason ?? null,
      content: ((response as any).content ?? []) as { type: string; text?: string }[],
      usage: {
        input_tokens: Number((response as any).usage?.input_tokens ?? 0),
        output_tokens: Number((response as any).usage?.output_tokens ?? 0),
        cache_creation_input_tokens: Number(
          (response as any).usage?.cache_creation_input_tokens ?? 0,
        ),
        cache_read_input_tokens: Number((response as any).usage?.cache_read_input_tokens ?? 0),
      },
    };
  };
}
