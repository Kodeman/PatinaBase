# @patina/aesthete-quiz

The Aesthete Engine style quiz, shared by the **client portal** and the **external marketing site** (design §3.2 #16):

- **`.` (core)** — question definitions, the quiz state machine, session-key management, typed errors, and a **plain-fetch PostgREST wire client with zero runtime dependencies** (no supabase-js).
- **`./react`** — `<QuizProvider>`, the headless `useStyleQuiz()` hook, and minimal unstyled components (peer dep `react ^19`; deliberately **no design-system dependency** — consumers style on top).

The wire contract itself is documented in [`WIRE-CONTRACT.md`](./WIRE-CONTRACT.md) — that file is the canonical handover for the external PatinaWebsite repo. Domain types live in `@patina/types` (`style-profile.ts`) and are re-exported from core.

```bash
pnpm --filter @patina/aesthete-quiz build   # tsc → dist (CJS + d.ts)
pnpm --filter @patina/aesthete-quiz test    # vitest (46 tests, no network)
```

## Usage — React (client portal or any React 19 app)

```tsx
import { QuizProvider, useStyleQuiz, QuizQuestionView, QuizProgress } from '@patina/aesthete-quiz/react';

function QuizPage() {
  return (
    <QuizProvider
      baseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      source="client_portal" // or "marketing_site"
    >
      <Quiz />
    </QuizProvider>
  );
}

function Quiz() {
  const quiz = useStyleQuiz({ onComplete: (profile) => console.log(profile.archetype.primary) });

  if (quiz.status === 'complete' && quiz.result) {
    return <pre>{JSON.stringify(quiz.result.spectrums, null, 2)}</pre>; // style your results view
  }

  return (
    <div>
      <QuizProgress step={quiz.step} totalSteps={quiz.totalSteps} />
      <QuizQuestionView
        question={quiz.question}
        answers={quiz.state.answers}
        onSelect={quiz.select}
        onToggleLifestyle={quiz.toggleLifestyle}
        disabled={quiz.status === 'submitting'}
      />
      {!quiz.isFirst && <button onClick={quiz.back}>Back</button>}
      {quiz.isLast
        ? <button disabled={!quiz.isComplete} onClick={quiz.submit}>See my profile</button>
        : <button disabled={!quiz.canAdvance} onClick={quiz.next}>Next</button>}
      {quiz.error && <p role="alert">{quiz.error.kind === 'rate_limited' ? 'Give it an hour and try again.' : 'Something went wrong — try again.'}</p>}
    </div>
  );
}
```

Everything is also reachable headlessly — `useStyleQuiz` exposes the raw machine state, and the components are optional. Style via `className` props and the `data-quiz-*` attributes.

## Usage — no React (marketing site, scripts, tests)

```ts
import {
  getOrCreateSessionKey,
  submitStyleQuiz,
  claimQuizSession,
  QuizRateLimitError,
  QUIZ_QUESTIONS,
} from '@patina/aesthete-quiz';

const profile = await submitStyleQuiz({
  baseUrl: 'https://api.patina.cloud',
  anonKey: SUPABASE_ANON_KEY,
  sessionKey: getOrCreateSessionKey(), // uuidv4, localStorage-persisted, SSR-safe
  answers: {
    visual_resonance: 'warm_minimal',
    lifestyle: ['family', 'entertaining'],
    material: 'weathered_oak',
    investment: 'heirloom',
    catalyst: 'new_home',
  },
  timings: { q1_ms: 4200 },
  source: 'marketing_site',
  attribution: { utm_source: 'launch', posthog_distinct_id: distinctId },
});

// Later, after signup (requires the user's Supabase JWT):
await claimQuizSession({
  baseUrl,
  anonKey: SUPABASE_ANON_KEY,
  accessToken: session.access_token,
  sessionKey: getOrCreateSessionKey(),
});
```

Errors are typed: catch `AestheteQuizError` and branch on `.kind` (`rate_limited` | `invalid_answers` | `forbidden` | `unknown_session` | `auth_required` | `network` | `server`). Note the shipped rate limits surface as **HTTP 400, not 429** (see WIRE-CONTRACT.md).

The non-React state machine is exported too (`createInitialQuizState`, `quizReducer`, `buildAnswers`, selectors) — `useStyleQuiz` is a thin wrapper over it.

## Live smoke (manual, excluded from vitest)

```bash
pnpm --filter @patina/aesthete-quiz build
cd packages/aesthete-quiz
SUPABASE_ANON_KEY=$(supabase status -o env | grep '^ANON_KEY' | cut -d'"' -f2) node scripts/smoke.ts
```

Runs a real anon submit against the local stack with a throwaway session key and asserts the shipped response shape, resubmit versioning, and the typed error paths.
