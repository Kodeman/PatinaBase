// Deno tests for _shared/hours-judgment.ts — the candidate finder (pure) and
// the typed-judgment gate (stubbed transport, no network).
//
// Run: deno test --no-check -A --no-lock \
//        --config supabase/functions/deno.json \
//        supabase/functions/_shared/hours-judgment.test.ts

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  findHourCandidates,
  HOURS_JUDGMENT_MIN_CONFIDENCE,
  type HoursJudgmentInput,
  judgeHoursReply,
} from "./hours-judgment.ts";

// ── the candidate finder ─────────────────────────────────────────────────────

const spansOf = (body: string) => findHourCandidates(body).map((c) => c.span);
const hoursOf = (body: string) => findHourCandidates(body).map((c) => c.hours);

Deno.test("findHourCandidates: a decimal is one span, not its two digits", () => {
  assertEquals(spansOf("6.5"), ["6.5"]);
  assertEquals(hoursOf("6.5"), [6.5]);
  // A comma is a decimal point on half the keyboards this rail texts.
  assertEquals(hoursOf("6,5"), [6.5]);
});

Deno.test("findHourCandidates: 'about 6 and a half' keeps the whole compound span", () => {
  const found = findHourCandidates("about 6 and a half");
  assertEquals(found, [{ span: "6 and a half", hours: 6.5 }]);
});

Deno.test("findHourCandidates: '6 1/2' is one span worth 6.5", () => {
  assertEquals(findHourCandidates("6 1/2"), [{ span: "6 1/2", hours: 6.5 }]);
});

Deno.test("findHourCandidates: a number word is a candidate", () => {
  assertEquals(findHourCandidates("eight"), [{ span: "eight", hours: 8 }]);
});

Deno.test("findHourCandidates: over-recall keeps a number the reply may not mean as hours", () => {
  // Two days and one number: the finder offers the 8, and the multi_day
  // judgment — not this function — is what stops it being booked.
  assertEquals(findHourCandidates("was there mon and tues, 8 each"), [{ span: "8", hours: 8 }]);
});

Deno.test("findHourCandidates: a reply with no number yields nothing", () => {
  assertEquals(findHourCandidates("didn't make it"), []);
  assertEquals(findHourCandidates("who is this?"), []);
});

// ── the judgment ─────────────────────────────────────────────────────────────

interface StubCall {
  url: string;
  init: RequestInit;
}

function stubFetch(handler: (call: StubCall) => Response | Promise<Response>) {
  const calls: StubCall[] = [];
  const impl = ((url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return Promise.resolve(handler(call));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A confident, single-day, span-selected set of answers. */
function answers(overrides: Record<string, unknown> = {}) {
  return {
    intent: { type: "choice", choice: "reports_hours", confidence: 0.95, probabilities: { reports_hours: 0.95 } },
    hours_span: { type: "choice", choice: "6 and a half", confidence: 0.9, probabilities: { "6 and a half": 0.9 } },
    multi_day: { type: "noul", noul: 0.03 },
    ...overrides,
  };
}

const INPUT: HoursJudgmentInput = {
  body: "about 6 and a half",
  askText: "How many hours today at the Harbour Street kitchen? Reply with a number — Ref 42",
  taskTitle: "Harbour Street kitchen — cabinet hang",
  askDay: "2026-09-19",
  openPrompts: [{ code: "42", label: "Harbour Street kitchen — cabinet hang" }],
};

const KEY = () => "typesafe-test-key";

Deno.test("judgeHoursReply: a confident reading books the code's own value for the selected span", async () => {
  const { impl, calls } = stubFetch(() => jsonResponse({ model: "jev-1.13.0", answers: answers() }));
  const verdict = await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY });
  assertEquals(verdict, { kind: "hours", hours: 6.5, promptCode: "42", confidence: 0.9 });
  assertEquals(calls.length, 1);
});

Deno.test("judgeHoursReply: the hours never come from the model's own numbers", async () => {
  // The model is given every chance to supply a number; the value returned is
  // still findHourCandidates' normalization of the span it SELECTED.
  const { impl } = stubFetch(() =>
    jsonResponse({
      answers: answers({
        hours_span: { type: "choice", choice: "6 and a half", confidence: 0.9, hours: 99, value: 99 },
      }),
    })
  );
  const verdict = await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY });
  assertEquals(verdict, { kind: "hours", hours: 6.5, promptCode: "42", confidence: 0.9 });
});

Deno.test("judgeHoursReply: the minimum confidence across the choices is the one that gates", async () => {
  const { impl } = stubFetch(() =>
    jsonResponse({
      answers: answers({
        hours_span: { type: "choice", choice: "6 and a half", confidence: 0.61 },
      }),
    })
  );
  assert(0.61 < HOURS_JUDGMENT_MIN_CONFIDENCE);
  assertEquals(await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY }), {
    kind: "defer",
    reason: "low_confidence",
  });
});

Deno.test("judgeHoursReply: a reply covering more than one day is not one day's hours", async () => {
  const { impl } = stubFetch(() =>
    jsonResponse({
      answers: {
        intent: { type: "choice", choice: "reports_hours", confidence: 0.93 },
        hours_span: { type: "choice", choice: "8", confidence: 0.88 },
        multi_day: { type: "noul", noul: 0.91 },
      },
    })
  );
  const verdict = await judgeHoursReply(
    { ...INPUT, body: "was there mon and tues, 8 each" },
    { fetchImpl: impl, getEnv: KEY },
  );
  assertEquals(verdict, { kind: "defer", reason: "multi_day" });
});

Deno.test("judgeHoursReply: a reply that is not reporting hours defers on intent", async () => {
  const { impl } = stubFetch(() =>
    jsonResponse({
      answers: answers({
        intent: { type: "choice", choice: "other_topic", confidence: 0.97 },
      }),
    })
  );
  assertEquals(await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY }), {
    kind: "defer",
    reason: "intent",
  });
});

Deno.test("judgeHoursReply: the no-match option defers rather than forcing a span", async () => {
  const { impl } = stubFetch(() =>
    jsonResponse({
      answers: answers({
        hours_span: { type: "choice", choice: "none_of_these", confidence: 0.94 },
      }),
    })
  );
  assertEquals(await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY }), {
    kind: "defer",
    reason: "no_candidates",
  });
});

Deno.test("judgeHoursReply: a number no day can hold is not booked", async () => {
  const { impl } = stubFetch(() =>
    jsonResponse({
      answers: {
        intent: { type: "choice", choice: "reports_hours", confidence: 0.95 },
        hours_span: { type: "choice", choice: "20", confidence: 0.93 },
        multi_day: { type: "noul", noul: 0.02 },
      },
    })
  );
  const verdict = await judgeHoursReply({ ...INPUT, body: "20 hrs" }, { fetchImpl: impl, getEnv: KEY });
  assertEquals(verdict, { kind: "defer", reason: "out_of_range" });
});

Deno.test("judgeHoursReply: a non-2xx answer defers on http", async () => {
  const { impl, calls } = stubFetch(() => new Response("upstream on fire", { status: 500 }));
  assertEquals(await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY }), {
    kind: "defer",
    reason: "http",
  });
  assertEquals(calls.length, 1);
});

Deno.test("judgeHoursReply: an abort defers on timeout", async () => {
  const { impl } = stubFetch(({ init }) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })
  );
  assertEquals(await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY, timeoutMs: 5 }), {
    kind: "defer",
    reason: "timeout",
  });
});

Deno.test("judgeHoursReply: no key means no request and no reading", async () => {
  const { impl, calls } = stubFetch(() => jsonResponse({ answers: answers() }));
  assertEquals(await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: () => undefined }), {
    kind: "defer",
    reason: "no_key",
  });
  assertEquals(calls.length, 0);
});

Deno.test("judgeHoursReply: nothing number-shaped in the body means no request", async () => {
  const { impl, calls } = stubFetch(() => jsonResponse({ answers: answers() }));
  assertEquals(await judgeHoursReply({ ...INPUT, body: "who is this?" }, { fetchImpl: impl, getEnv: KEY }), {
    kind: "defer",
    reason: "no_candidates",
  });
  assertEquals(calls.length, 0);
});

Deno.test("judgeHoursReply: a malformed answer defers rather than throwing", async () => {
  const cases: Array<[string, unknown]> = [
    ["no answers key at all", { model: "jev-1.13.0" }],
    ["answers is not an object", { answers: [] }],
    ["a choice with no confidence", { answers: answers({ intent: { type: "choice", choice: "reports_hours" } }) }],
    ["the noul answer is missing", { answers: answers({ multi_day: { type: "noul" } }) }],
    [
      "a chosen span we never offered",
      { answers: answers({ hours_span: { type: "choice", choice: "seven and a quarter", confidence: 0.99 } }) },
    ],
  ];
  for (const [name, payload] of cases) {
    const { impl } = stubFetch(() => jsonResponse(payload));
    assertEquals(
      await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY }),
      { kind: "defer", reason: "malformed" },
      name,
    );
  }
  // A body that is not JSON at all is the same malformed answer.
  const { impl } = stubFetch(() => new Response("<html>gateway</html>", { status: 200 }));
  assertEquals(await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY }), {
    kind: "defer",
    reason: "malformed",
  });
});

// ── what leaves this rail ────────────────────────────────────────────────────

Deno.test("judgeHoursReply: the request carries the ask and the candidates, and no identity", async () => {
  const { impl, calls } = stubFetch(() => jsonResponse({ answers: answers() }));
  await judgeHoursReply(INPUT, { fetchImpl: impl, getEnv: KEY, model: "jev-latest" });

  const [call] = calls;
  assertEquals(call.url, "https://api.typesafe.ai/v1/systemone");
  assertEquals(call.init.method, "POST");
  assertEquals(
    (call.init.headers as Record<string, string>)["Authorization"],
    "Bearer typesafe-test-key",
  );
  const sent = JSON.parse(String(call.init.body));
  assertEquals(sent.model, "jev-latest");
  assertEquals(sent.state.message, "about 6 and a half");
  assertEquals(sent.state.ask, {
    text: INPUT.askText,
    task_title: INPUT.taskTitle,
    day: "2026-09-19",
  });
  assertEquals(sent.state.candidates, ["6 and a half"]);
  assertEquals(sent.state.open_prompts, [{ code: "42", label: INPUT.taskTitle }]);

  // NEVER a phone number, a party name or a row id.
  const wire = String(call.init.body);
  for (const secret of ["+15551234567", "+15557654321", "Ray Okonkwo", "party-a", "prompt-a"]) {
    assert(!wire.includes(secret), `outbound body must not carry ${secret}`);
  }
  assertEquals(/\+?\d{10,}/.test(wire), false, "outbound body must not carry a phone-shaped number");

  // Each question names its state path in backticks, and each choice offers a
  // way out of the list.
  assertStringIncludes(JSON.stringify(sent.questions.intent), "`ask.day`");
  assertStringIncludes(JSON.stringify(sent.questions.hours_span), "`message`");
  assertEquals(sent.questions.intent.type, "choice");
  assert("none" in sent.questions.intent.criteria);
  assertEquals(sent.questions.hours_span.type, "choice");
  assert("none_of_these" in sent.questions.hours_span.criteria);
  assertEquals(Object.keys(sent.questions.hours_span.criteria), ["6 and a half", "none_of_these"]);
  assertEquals(sent.questions.multi_day.type, "noul");
  assertEquals(Object.keys(sent.questions.multi_day.criteria).sort(), ["false", "true"]);
});

Deno.test("judgeHoursReply: which_prompt is asked only when more than one ask is open", async () => {
  const one = stubFetch(() => jsonResponse({ answers: answers() }));
  await judgeHoursReply(INPUT, { fetchImpl: one.impl, getEnv: KEY });
  assertEquals("which_prompt" in JSON.parse(String(one.calls[0].init.body)).questions, false);

  const two = stubFetch(() =>
    jsonResponse({
      answers: answers({
        which_prompt: { type: "choice", choice: "43", confidence: 0.86 },
      }),
    })
  );
  const twoOpen: HoursJudgmentInput = {
    ...INPUT,
    openPrompts: [
      { code: "42", label: "Harbour Street kitchen — cabinet hang" },
      { code: "43", label: "Alder Row bath — tile set" },
    ],
  };
  const verdict = await judgeHoursReply(twoOpen, { fetchImpl: two.impl, getEnv: KEY });
  const sent = JSON.parse(String(two.calls[0].init.body));
  assertEquals(sent.questions.which_prompt.type, "choice");
  assertEquals(Object.keys(sent.questions.which_prompt.criteria), ["42", "43", "unclear"]);
  assertEquals(verdict, { kind: "hours", hours: 6.5, promptCode: "43", confidence: 0.86 });
});

Deno.test("judgeHoursReply: an unclear which_prompt leaves the choice to the caller", async () => {
  const { impl } = stubFetch(() =>
    jsonResponse({
      answers: answers({
        which_prompt: { type: "choice", choice: "unclear", confidence: 0.82 },
      }),
    })
  );
  const verdict = await judgeHoursReply(
    {
      ...INPUT,
      openPrompts: [
        { code: "42", label: "Harbour Street kitchen — cabinet hang" },
        { code: "43", label: "Alder Row bath — tile set" },
      ],
    },
    { fetchImpl: impl, getEnv: KEY },
  );
  assertEquals(verdict, { kind: "hours", hours: 6.5, promptCode: null, confidence: 0.82 });
});

Deno.test("judgeHoursReply: a missing which_prompt answer where one was asked is malformed", async () => {
  const { impl } = stubFetch(() => jsonResponse({ answers: answers() }));
  const verdict = await judgeHoursReply(
    {
      ...INPUT,
      openPrompts: [
        { code: "42", label: "Harbour Street kitchen — cabinet hang" },
        { code: "43", label: "Alder Row bath — tile set" },
      ],
    },
    { fetchImpl: impl, getEnv: KEY },
  );
  assertEquals(verdict, { kind: "defer", reason: "malformed" });
});
