/**
 * MANUAL live-stack integration smoke — NOT a vitest test (scripts/ is
 * excluded from the test glob; this hits the real local Supabase).
 *
 * Runs a real anon submit against the live 00243 RPCs with a THROWAWAY
 * session key and asserts the §7.1-as-shipped response shape, the version
 * bump on resubmit, and the typed error paths (invalid answers, session rate
 * limit, anon claim refusal).
 *
 * Usage:
 *   pnpm --filter @patina/aesthete-quiz build
 *   SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=$(cd ../../ && supabase status -o env | grep '^ANON_KEY' | cut -d'"' -f2) \
 *     node scripts/smoke.ts
 *
 * Defaults: SUPABASE_URL=http://localhost:54321; the anon key MUST be provided.
 */
import assert from 'node:assert/strict';
import {
  claimQuizSession,
  generateSessionKey,
  submitStyleQuiz,
} from '../dist/core/index.js';

const baseUrl = process.env.SUPABASE_URL ?? 'http://localhost:54321';
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!anonKey) {
  console.error('SUPABASE_ANON_KEY is required (from `supabase status -o env`)');
  process.exit(1);
}

const SPECTRUM_KEYS = ['warmth', 'complexity', 'formality', 'timelessness', 'boldness', 'craftsmanship'];
const UUID_RE = /^[0-9a-f-]{36}$/i;

const answers = {
  visual_resonance: 'warm_minimal',
  lifestyle: ['family', 'entertaining'],
  material: 'weathered_oak',
  investment: 'heirloom',
  catalyst: 'new_home',
} as const;

async function main() {
  const sessionKey = generateSessionKey(); // throwaway
  console.log(`baseUrl=${baseUrl}`);
  console.log(`throwaway session_key=${sessionKey}\n`);

  // 1 — real anon submit → full §7.1 profile
  const profile = await submitStyleQuiz({
    baseUrl,
    anonKey,
    sessionKey,
    answers: { ...answers, lifestyle: [...answers.lifestyle] },
    timings: { q1_ms: 4200, q2_ms: 3100, q3_ms: 2500, q4_ms: 1800, q5_ms: 1200 },
    source: 'marketing_site',
    attribution: { utm_source: 'aesthete-quiz-smoke' },
  });
  console.log('submit #1 →', JSON.stringify(profile, null, 2));

  assert.match(String(profile.profile_id), UUID_RE, 'profile_id is a uuid');
  assert.equal(profile.session_key, sessionKey, 'session_key echoes');
  assert.equal(typeof profile.archetype, 'object');
  assert.ok('primary' in profile.archetype && 'secondary' in profile.archetype && 'confidence' in profile.archetype);
  for (const k of SPECTRUM_KEYS) {
    const v = profile.spectrums[k as keyof typeof profile.spectrums];
    assert.equal(typeof v, 'number', `spectrums.${k} is a number`);
    assert.ok(v >= -1 && v <= 1, `spectrums.${k} ∈ [−1,1]`);
    const c = profile.spectrum_confidence[k as keyof typeof profile.spectrum_confidence];
    assert.equal(typeof c, 'number', `spectrum_confidence.${k} is a number`);
    assert.ok(c >= 0 && c <= 1, `spectrum_confidence.${k} ∈ [0,1]`);
  }
  assert.equal(profile.budget.label, 'Heirloom');
  assert.equal(profile.budget.min_cents, 500000);
  assert.equal(profile.budget.max_cents, 1500000);
  assert.equal(profile.budget.value_orientation, 0.7);
  assert.equal(typeof profile.material_affinities, 'object');
  assert.equal(profile.material_affinities.wood, 0.9);
  assert.equal(profile.catalyst, 'new_home');
  assert.equal(typeof profile.patina_affinity, 'number'); // additive key
  assert.equal(profile.version, 1); // additive key
  console.log('✓ submit #1: §7.1 keys + additive keys all present and sane');

  // 2 — resubmit same key → an update (version 2), not a duplicate
  const second = await submitStyleQuiz({
    baseUrl,
    anonKey,
    sessionKey,
    answers: { ...answers, lifestyle: [...answers.lifestyle], material: 'aged_leather' },
    source: 'marketing_site',
  });
  assert.equal(second.version, 2, 'resubmission bumps version');
  assert.equal(second.session_key, sessionKey);
  console.log('✓ submit #2: resubmit is an update — version', second.version);

  // 3 — invalid answers → QuizInvalidAnswersError
  try {
    await submitStyleQuiz({
      baseUrl,
      anonKey,
      sessionKey: generateSessionKey(),
      answers: { ...answers, lifestyle: [...answers.lifestyle], material: 'velvet' as never },
    });
    assert.fail('expected invalid-answers rejection');
  } catch (err) {
    const e = err as { name?: string; kind?: string; status?: number };
    assert.equal(e.kind, 'invalid_answers', `typed as invalid_answers (got ${e.kind})`);
    console.log(`✓ unknown material option → ${e.name} (kind=${e.kind}, http=${e.status})`);
  }

  // 4 — session rate limit: 3/hour/session_key → 4th submit trips, typed rate_limited
  await submitStyleQuiz({ baseUrl, anonKey, sessionKey, answers: { ...answers, lifestyle: [...answers.lifestyle] } }); // v3
  try {
    await submitStyleQuiz({ baseUrl, anonKey, sessionKey, answers: { ...answers, lifestyle: [...answers.lifestyle] } });
    assert.fail('expected rate-limit rejection on 4th submit');
  } catch (err) {
    const e = err as { name?: string; kind?: string; status?: number };
    assert.equal(e.kind, 'rate_limited', `typed as rate_limited (got ${e.kind})`);
    console.log(`✓ 4th submit in the hour → ${e.name} (kind=${e.kind}, http=${e.status} — 400 by design, not 429)`);
  }

  // 5 — anon claim → refused (authenticated-only grant)
  try {
    await claimQuizSession({ baseUrl, anonKey, accessToken: anonKey, sessionKey });
    assert.fail('expected anon claim rejection');
  } catch (err) {
    const e = err as { name?: string; kind?: string; status?: number };
    assert.ok(e.kind === 'forbidden' || e.kind === 'server', `claim refused for anon (kind=${e.kind})`);
    console.log(`✓ anon claim refused → ${e.name} (kind=${e.kind}, http=${e.status})`);
  }

  console.log('\nSMOKE PASS — live contract matches WIRE-CONTRACT.md');
}

main().catch((err) => {
  console.error('\nSMOKE FAIL:', err);
  process.exit(1);
});
