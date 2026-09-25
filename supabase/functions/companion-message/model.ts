// Model resolver for companion-message.
//
// Side-effect-free: reads no environment other than what is passed in via
// `env`, so it can be unit tested without a Deno runtime or live secrets.
//
// NI-03 (WAVE-NEXT-PLAN.md): moves the Claude model pin out of the request
// body construction in index.ts and into a resolver that prefers the
// COMPANION_MODEL env var, falling back to the existing pin. There is no
// production behavior change until COMPANION_MODEL is set (Kody ruled Q5:
// the fallback stays at deploy).

export const DEFAULT_COMPANION_MODEL = "claude-sonnet-4-20250514";

export function resolveModel(env: { get(key: string): string | undefined }): string {
  return env.get("COMPANION_MODEL") || DEFAULT_COMPANION_MODEL;
}
