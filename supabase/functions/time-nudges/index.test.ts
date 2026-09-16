// Deno tests for time-nudges (hour-tracking, W4 / lane D, HT-34).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/
//
// Tests logic.ts directly against an in-memory fake TimeNudgesPort — importing
// ./index.ts would boot Deno.serve (aesthete-nightly / po-send convention).
// The fake never exposes an email/push/SMS method at all, so "zero email/SMS
// calls" is structural (nothing to call), and every assertion below also
// checks the fake's own call counters to prove which port methods actually
// ran for a given rule.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildRunningTimerRecord,
  buildWeeklyUnloggedRecord,
  isoWeekKey,
  isServiceRoleCaller,
  type NotificationLogInsert,
  type OptedInMemberRow,
  parseSecretKeys,
  resolveNudgeRule,
  RUNNING_TIMER_NUDGE_TYPE,
  type RunningTimerRow,
  runTimeNudges,
  staleRunningTimerCutoff,
  type TimeNudgesPort,
  WEEKLY_UNLOGGED_NUDGE_TYPE,
  weeklyLookbackSince,
} from "./logic.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = new Date("2026-09-17T12:00:00.000Z"); // a Thursday

interface FakeWorld {
  runningTimers: RunningTimerRow[];
  weeklyOptIn: Map<string, boolean>;
  recentEntryByUser: Map<string, string[]>; // user_id -> started_at[]
}

interface FakePortHandle {
  port: TimeNudgesPort;
  log: NotificationLogInsert[];
  calls: {
    listStaleRunningTimers: number;
    hasRunningTimerRecord: number;
    listOptedInMembersNeedingWeeklyReminder: number;
    hasWeeklyUnloggedRecord: number;
    insertRecord: number;
  };
}

function makeFakePort(world: FakeWorld): FakePortHandle {
  const log: NotificationLogInsert[] = [];
  const calls = {
    listStaleRunningTimers: 0,
    hasRunningTimerRecord: 0,
    listOptedInMembersNeedingWeeklyReminder: 0,
    hasWeeklyUnloggedRecord: 0,
    insertRecord: 0,
  };

  const port: TimeNudgesPort = {
    listStaleRunningTimers(cutoffIso) {
      calls.listStaleRunningTimers++;
      return Promise.resolve(
        world.runningTimers.filter((e) => e.started_at <= cutoffIso),
      );
    },
    hasRunningTimerRecord(userId, entryId) {
      calls.hasRunningTimerRecord++;
      return Promise.resolve(
        log.some(
          (r) =>
            r.user_id === userId &&
            r.type === RUNNING_TIMER_NUDGE_TYPE &&
            r.metadata.entry_id === entryId,
        ),
      );
    },
    listOptedInMembersNeedingWeeklyReminder(sinceIso) {
      calls.listOptedInMembersNeedingWeeklyReminder++;
      const out: OptedInMemberRow[] = [];
      for (const [userId, optedIn] of world.weeklyOptIn) {
        if (!optedIn) continue;
        const recent = world.recentEntryByUser.get(userId) ?? [];
        const loggedSince = recent.some((ts) => ts >= sinceIso);
        if (!loggedSince) out.push({ id: userId });
      }
      return Promise.resolve(out);
    },
    hasWeeklyUnloggedRecord(userId, weekKey) {
      calls.hasWeeklyUnloggedRecord++;
      return Promise.resolve(
        log.some(
          (r) =>
            r.user_id === userId &&
            r.type === WEEKLY_UNLOGGED_NUDGE_TYPE &&
            r.metadata.week_key === weekKey,
        ),
      );
    },
    insertRecord(row) {
      calls.insertRecord++;
      log.push(row);
      return Promise.resolve();
    },
  };

  return { port, log, calls };
}

// ─── rule (a): the running-timer sweep ─────────────────────────────────────

Deno.test(
  "rule (a): a 9-hour running timer produces exactly one Record row across repeated hourly sweeps, and zero email/SMS calls",
  async () => {
    const entry: RunningTimerRow = {
      id: "entry-1",
      user_id: "user-1",
      project_id: "project-1",
      started_at: new Date(NOW.getTime() - 9 * HOUR_MS).toISOString(),
    };
    const { port, log } = makeFakePort({
      runningTimers: [entry],
      weeklyOptIn: new Map(),
      recentEntryByUser: new Map(),
    });

    // Nine hourly sweeps over the same still-running timer (default body {},
    // exactly what invoke_edge_function's 00614 cron sends).
    for (let sweep = 0; sweep < 9; sweep++) {
      const sweepNow = new Date(NOW.getTime() + sweep * HOUR_MS);
      await runTimeNudges(port, {}, sweepNow);
    }

    assertEquals(log.length, 1, "exactly one Record row across nine sweeps");
    assertEquals(log[0].user_id, "user-1");
    assertEquals(log[0].type, RUNNING_TIMER_NUDGE_TYPE);
    assertEquals(log[0].channel, "in_app");
    assertEquals(log[0].status, "delivered");
    assertEquals(log[0].metadata.entry_id, "entry-1");
    // D-R1-02: read_at must be stamped so useUnreadInboxCount's "any in_app
    // row with no read_at is unread" rule never turns this Record row into a
    // badge — a nudge is supposed to be quiet.
    assert(
      typeof log[0].metadata.read_at === "string" && log[0].metadata.read_at,
    );
    // D-R1-07: documentHrefFor reads `sheet` (post-derivation.ts), not just
    // `deep_link` — a project-bearing notice's docHref otherwise wins over
    // the deep_link's own `?sheet=hours` query and silently drops it.
    assertEquals(log[0].metadata.sheet, "hours");

    // Structural proof of "no push, no email, no SMS, no badge": the fake port
    // exposes exactly one write method, and every row it ever received is
    // in_app. There is no channel other than 'in_app' anywhere in the log.
    assert(log.every((r) => r.channel === "in_app"));
    assertEquals(
      log.filter((r) => r.channel !== "in_app").length,
      0,
      "no non-in_app channel was ever written",
    );
  },
);

Deno.test(
  "rule (a): a timer running less than 8 hours produces no Record row",
  async () => {
    const entry: RunningTimerRow = {
      id: "entry-2",
      user_id: "user-2",
      project_id: "project-2",
      started_at: new Date(NOW.getTime() - 5 * HOUR_MS).toISOString(),
    };
    const { port, log } = makeFakePort({
      runningTimers: [entry],
      weeklyOptIn: new Map(),
      recentEntryByUser: new Map(),
    });

    const result = await runTimeNudges(port, { rule: "running_timer" }, NOW);

    assertEquals(result.scanned, 0);
    assertEquals(result.recorded, 0);
    assertEquals(log.length, 0);
  },
);

// D-R1-08 (round-1 review): a test formerly lived here named "a completed
// entry (duration_minutes set) never reaches the port's stale-timer query
// surface" — it seeded `runningTimers: []` and asserted `scanned === 0`,
// without ever constructing a completed entry or reading a `duration_minutes`
// value anywhere in the assertion. Its own comment conceded "the fake mirrors
// that contract by construction", i.e. it was tautological: any empty world
// asserts `scanned === 0` regardless of what the test's name claims to cover.
// The real predicate (`.is("duration_minutes", null)`, index.ts's
// `listStaleRunningTimers`) has zero execution coverage in this deno suite —
// TimeNudgesPort is a structural fake that never runs a real query, and
// nothing here imports index.ts. Removed rather than promoted: proving the
// real filter requires a live Postgres, which is exactly what D-R1-09 names
// as owed at the ship chain (a live probe after `supabase functions deploy`),
// not something a deno-only fake can honestly assert.

// ─── rule (b): the dark weekly-unlogged sweep ──────────────────────────────

Deno.test(
  "rule (b): only opted-in members with nothing logged this week are selected; an opted-out member yields nothing",
  async () => {
    const since = weeklyLookbackSince(NOW);
    const recentIso = new Date(NOW.getTime() - 1 * DAY_MS).toISOString();
    const staleIso = new Date(NOW.getTime() - 10 * DAY_MS).toISOString();

    const { port, log, calls } = makeFakePort({
      runningTimers: [],
      weeklyOptIn: new Map([
        ["opted-in-quiet", true], // opted in, nothing logged this week -> nudged
        ["opted-in-active", true], // opted in, logged recently -> not nudged
        ["opted-out-quiet", false], // opted out -> never a candidate
      ]),
      recentEntryByUser: new Map([
        ["opted-in-quiet", [staleIso]],
        ["opted-in-active", [recentIso]],
        ["opted-out-quiet", [staleIso]],
      ]),
    });

    const result = await runTimeNudges(port, { rule: "weekly_unlogged" }, NOW);

    assertEquals(calls.listOptedInMembersNeedingWeeklyReminder, 1);
    assertEquals(
      result.scanned,
      1,
      "only the quiet opted-in member is a candidate",
    );
    assertEquals(result.recorded, 1);
    assertEquals(log.length, 1);
    assertEquals(log[0].user_id, "opted-in-quiet");
    assertEquals(log[0].type, WEEKLY_UNLOGGED_NUDGE_TYPE);
    assertEquals(log[0].channel, "in_app");
    assertEquals(log[0].metadata.week_key, isoWeekKey(NOW));
    // D-R1-02, same reasoning as the running-timer record: never a badge.
    assert(
      typeof log[0].metadata.read_at === "string" && log[0].metadata.read_at,
    );

    // The opted-out member never appears, and never would even if quiet.
    assert(!log.some((r) => r.user_id === "opted-out-quiet"));
    assert(!log.some((r) => r.user_id === "opted-in-active"));

    void since; // documents the lookback window used to seed recentEntryByUser
  },
);

Deno.test(
  "rule (b): a second sweep the same week does not re-nudge (weekly, not hourly)",
  async () => {
    const staleIso = new Date(NOW.getTime() - 10 * DAY_MS).toISOString();
    const { port, log } = makeFakePort({
      runningTimers: [],
      weeklyOptIn: new Map([["opted-in-quiet", true]]),
      recentEntryByUser: new Map([["opted-in-quiet", [staleIso]]]),
    });

    await runTimeNudges(port, { rule: "weekly_unlogged" }, NOW);
    await runTimeNudges(
      port,
      { rule: "weekly_unlogged" },
      new Date(NOW.getTime() + 2 * HOUR_MS), // same ISO week
    );

    assertEquals(log.length, 1);
  },
);

// ─── routing: the default body never enters rule (b) ───────────────────────

Deno.test(
  "resolveNudgeRule: only an exact {rule:'weekly_unlogged'} body selects rule (b)",
  () => {
    assertEquals(resolveNudgeRule({}), "running_timer");
    assertEquals(resolveNudgeRule(undefined), "running_timer");
    assertEquals(resolveNudgeRule(null), "running_timer");
    assertEquals(resolveNudgeRule({ rule: "running_timer" }), "running_timer");
    assertEquals(resolveNudgeRule({ rule: "something_else" }), "running_timer");
    assertEquals(
      resolveNudgeRule({ rule: "weekly_unlogged" }),
      "weekly_unlogged",
    );
  },
);

Deno.test(
  "routing: the default body ({}) never calls the weekly-unlogged port methods, even when a candidate would qualify",
  async () => {
    const staleIso = new Date(NOW.getTime() - 10 * DAY_MS).toISOString();
    const { port, log, calls } = makeFakePort({
      runningTimers: [], // no running timers either — isolates the routing claim
      weeklyOptIn: new Map([["opted-in-quiet", true]]),
      recentEntryByUser: new Map([["opted-in-quiet", [staleIso]]]),
    });

    const result = await runTimeNudges(port, {}, NOW);

    assertEquals(result.rule, "running_timer");
    assertEquals(calls.listOptedInMembersNeedingWeeklyReminder, 0);
    assertEquals(calls.hasWeeklyUnloggedRecord, 0);
    assertEquals(log.length, 0, "the quiet opted-in member was never nudged");
  },
);

Deno.test(
  "routing: {rule:'running_timer'} explicitly behaves identically to the default body",
  async () => {
    const entry: RunningTimerRow = {
      id: "entry-3",
      user_id: "user-3",
      project_id: null,
      started_at: new Date(NOW.getTime() - 8.5 * HOUR_MS).toISOString(),
    };
    const worldA = {
      runningTimers: [entry],
      weeklyOptIn: new Map(),
      recentEntryByUser: new Map(),
    };
    const worldB = {
      runningTimers: [entry],
      weeklyOptIn: new Map(),
      recentEntryByUser: new Map(),
    };

    const a = await runTimeNudges(makeFakePort(worldA).port, {}, NOW);
    const b = await runTimeNudges(
      makeFakePort(worldB).port,
      { rule: "running_timer" },
      NOW,
    );

    assertEquals(a, b);
  },
);

// ─── pure helpers ───────────────────────────────────────────────────────────

Deno.test("staleRunningTimerCutoff: exactly 8 hours before now", () => {
  assertEquals(
    staleRunningTimerCutoff(NOW),
    new Date(NOW.getTime() - 8 * HOUR_MS).toISOString(),
  );
});

Deno.test("weeklyLookbackSince: exactly 7 days before now", () => {
  assertEquals(
    weeklyLookbackSince(NOW),
    new Date(NOW.getTime() - 7 * DAY_MS).toISOString(),
  );
});

Deno.test(
  "isoWeekKey: stable across the same ISO week, changes across a week boundary",
  () => {
    const monday = new Date("2026-09-14T00:00:01.000Z");
    const sundayNight = new Date("2026-09-20T23:59:00.000Z");
    const nextMonday = new Date("2026-09-21T00:00:01.000Z");

    assertEquals(isoWeekKey(monday), isoWeekKey(sundayNight));
    assert(isoWeekKey(nextMonday) !== isoWeekKey(monday));
  },
);

Deno.test(
  "buildRunningTimerRecord: no NOT NULL project_id assumption — a project-less (internal) timer still nudges",
  () => {
    const row = buildRunningTimerRecord(
      {
        id: "e",
        user_id: "u",
        project_id: null,
        started_at: NOW.toISOString(),
      },
      NOW,
    );
    assertEquals(row.metadata.project_id, null);
    assertEquals(row.metadata.deep_link, "/desk?book=hours");
    assertEquals(row.channel, "in_app");
    assertEquals(row.status, "delivered");
  },
);

Deno.test(
  "buildWeeklyUnloggedRecord: carries the week key used for its own dedupe",
  () => {
    const row = buildWeeklyUnloggedRecord("user-9", NOW);
    assertEquals(row.metadata.week_key, isoWeekKey(NOW));
    assertEquals(row.user_id, "user-9");
    assertEquals(row.type, WEEKLY_UNLOGGED_NUDGE_TYPE);
  },
);

// ─── caller verification (D-R1-01 / D-R1-11) ───────────────────────────────
// Ported in shape from client-invite/index.test.ts's coverage of the
// identical helper (client-invite/lib.ts) — same claims, same fixtures,
// because it is the same principal (the platform service role) verified the
// same way.

// A legacy service-role credential is a project-signed HS256 JWT. The
// gateway verifies the signature upstream, so this fixture only needs real
// claims, not a real signature.
function legacyJwt(claims: Record<string, unknown>): string {
  const seg = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${seg({ alg: "HS256", typ: "JWT" })}.${seg(claims)}.c2ln`;
}
const SERVICE_ROLE_CLAIMS = {
  iss: "supabase",
  ref: "bkvcixdmuyejfzcijpdg",
  role: "service_role",
  iat: 1_768_268_432,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

Deno.test("only the service role may run either sweep", () => {
  assert(isServiceRoleCaller("Bearer sr-key", "sr-key"));
  assert(!isServiceRoleCaller("Bearer anon-key", "sr-key"));
  assert(!isServiceRoleCaller(null, "sr-key"));
  assert(!isServiceRoleCaller("Bearer ", "sr-key"));
  // An empty configured key can never be satisfied.
  assert(!isServiceRoleCaller("Bearer ", ""));
});

Deno.test(
  "SUPABASE_SECRET_KEYS is parsed as a dictionary, an array, or a list",
  () => {
    assertEquals(parseSecretKeys(null), []);
    assertEquals(parseSecretKeys("   "), []);
    assertEquals(parseSecretKeys('{"default":"sb_secret_aaa"}'), [
      "sb_secret_aaa",
    ]);
    assertEquals(parseSecretKeys('["sb_secret_aaa"]'), ["sb_secret_aaa"]);
    assertEquals(parseSecretKeys("sb_secret_aaa, sb_secret_bbb"), [
      "sb_secret_aaa",
      "sb_secret_bbb",
    ]);
  },
);

Deno.test("the service role is one principal in three shapes", () => {
  const NEW = "sb_secret_newformat";
  const LEGACY = legacyJwt(SERVICE_ROLE_CLAIMS);
  const DICT = `{"default":"${NEW}"}`;

  // 1. The env key itself, whichever shape the platform injects.
  assert(
    isServiceRoleCaller(`Bearer ${NEW}`, NEW, DICT, "bkvcixdmuyejfzcijpdg"),
  );
  // 2. A key listed only in SUPABASE_SECRET_KEYS — the env key having moved on.
  assert(
    isServiceRoleCaller(`Bearer ${NEW}`, "sb_secret_someother", DICT, null),
  );
  // 3. A caller still holding the legacy service-role JWT, which matches
  //    neither the env key nor any listed secret key.
  assert(
    isServiceRoleCaller(`Bearer ${LEGACY}`, NEW, DICT, "bkvcixdmuyejfzcijpdg"),
  );
  // ...but only for THIS project, and only when the project is known at all.
  assert(!isServiceRoleCaller(`Bearer ${LEGACY}`, NEW, DICT, null));
});

Deno.test(
  "the two callers this function must turn away: an anon-key bearer, and a signed-in member's JWT",
  () => {
    const NEW = "sb_secret_newformat";
    const DICT = `{"default":"${NEW}"}`;
    const REF = "bkvcixdmuyejfzcijpdg";

    // D-R1-01's exact scenario: the publishable anon key is itself a
    // project-signed JWT and passes verify_jwt, but must not pass this.
    assert(!isServiceRoleCaller("Bearer sb_publishable_aaa", NEW, DICT, REF));
    assert(
      !isServiceRoleCaller(
        `Bearer ${legacyJwt({ ...SERVICE_ROLE_CLAIMS, role: "anon" })}`,
        NEW,
        DICT,
        REF,
      ),
    );
    // A signed-in designer or homeowner: the gateway lets her JWT through
    // (verify_jwt=true), this must not.
    assert(
      !isServiceRoleCaller(
        `Bearer ${legacyJwt({ ...SERVICE_ROLE_CLAIMS, role: "authenticated" })}`,
        NEW,
        DICT,
        REF,
      ),
    );
    // A service-role JWT minted for a DIFFERENT Supabase project.
    assert(
      !isServiceRoleCaller(
        `Bearer ${legacyJwt({ ...SERVICE_ROLE_CLAIMS, ref: "someotherproject" })}`,
        NEW,
        DICT,
        REF,
      ),
    );
    // An expired service-role JWT.
    assert(
      !isServiceRoleCaller(
        `Bearer ${legacyJwt({
          ...SERVICE_ROLE_CLAIMS,
          exp: Math.floor(Date.now() / 1000) - 1,
        })}`,
        NEW,
        DICT,
        REF,
      ),
    );
    // Not a JWT at all.
    assert(!isServiceRoleCaller("Bearer a.b", NEW, DICT, REF));
    assert(!isServiceRoleCaller("Bearer a.b.c", NEW, DICT, REF));
  },
);
