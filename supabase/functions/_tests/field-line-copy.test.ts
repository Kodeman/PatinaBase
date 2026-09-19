// The Field Line compliance copy (contract S8) asserted against the ONE place
// it is written: the SQL literals in migration 00641. Reading the migration
// rather than the database is deliberate — this is the copy we ship, and it has
// to be right before anyone applies anything.
//
// What a trade sees has to survive four different readers: a carrier (the
// rates/HELP/STOP line), a person on a flip phone (the studio's name first, no
// software words), an accountant (two GSM-7 segments, not three), and the S1
// reply grammar (`Reply YES 42`, `Ref 42`).
//
// Run: deno test --no-check -A --config supabase/functions/deno.json \
//        supabase/functions/_tests/field-line-copy.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildDigestMenu,
  DIGEST_MENU_MAX_SEPTETS,
} from "../field-daily/core.ts";

const MIGRATION = new URL(
  "../../migrations/00641_field_line_effects_templates.sql",
  import.meta.url,
);

const START = "-- <<< FIELD LINE COPY BLOCK";
const END = "-- >>> FIELD LINE COPY BLOCK";

/** Two segments of GSM-7. An extension character costs two septets. */
const TWO_SEGMENTS = 306;

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

/** The longest value each parameter may carry and still leave two segments.
 *  `link` is not a budget but a measurement: CLIENT_PORTAL_URL (sms.ts:797) +
 *  "/field/" + the 64-hex token create_field_link mints (00627:602) — 98
 *  septets of the 306 before a single word of copy. The rest are the copy
 *  contract the senders must hold to. Every budget here is in SEPTETS, not
 *  characters: a name written in GSM-7 extension characters spends two septets
 *  each, so 24 septets of studio name is 24 plain letters or 12 of "[". And
 *  `menu` is not a sample any more — it is the bound buildDigestMenu enforces,
 *  so the producer and this test cannot disagree about the budget. */
const MAX_PARAM: Record<string, string> = {
  link: `https://client.patina.cloud/field/${"a".repeat(64)}`,
  selection: "S".repeat(240),
  studio_name: "S".repeat(24),
  project_name: "P".repeat(24),
  item_title: "I".repeat(40),
  menu: "M".repeat(DIGEST_MENU_MAX_SEPTETS),
  delivery_window: "W".repeat(12),
  delivery_summary: "D".repeat(24),
  party_first_name: "F".repeat(12),
  ref: "999",
  code: "999",
  message: "M".repeat(216),
};

/** Words that make a text sound like software instead of a person. */
const BLACKLIST = /\b(platform|portal|dashboard|account|accounts)\b/i;
/** "AI" only as a word — `available` is not a policy violation. */
const AI_WORD = /\bAI\b/;

const EXPECTED_SLUGS = [
  "sms_optin_invite",
  "sms_optin_confirm",
  "sms_court_assignment",
  "sms_daily_digest",
  "sms_delivery_confirm",
  "sms_help",
  "sms_selection",
  "sms_inbound_reply",
];

interface Template {
  slug: string;
  name: string;
  head: string;
  vars: string[];
  body: string;
}

function unquote(literal: string): string {
  return literal.replace(/''/g, "'");
}

function septetsOf(text: string): { count: number; illegal: string[] } {
  let count = 0;
  const illegal: string[] = [];
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) count += 1;
    else if (GSM7_EXTENDED.includes(ch)) count += 2;
    else {
      count += 1;
      if (!illegal.includes(ch)) illegal.push(ch);
    }
  }
  return { count, illegal };
}

function render(body: string): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
    const value = MAX_PARAM[key];
    assert(value !== undefined, `no documented maximum for {{${key}}} (${whole})`);
    return value;
  });
}

const sql = await Deno.readTextFile(MIGRATION);
const block = sql.slice(
  sql.indexOf(START) + START.length,
  sql.indexOf(END),
);
assert(block.length > 0, "the copy block markers must bracket the templates");

const closingMatch = block.match(
  /v_closing\s+CONSTANT\s+text\s*:=\s*'((?:[^']|'')*)'/,
);
assert(closingMatch, "the canonical closing line must be a single constant");
const CLOSING = unquote(closingMatch[1]);

const TEMPLATES: Template[] = [
  ...block.matchAll(
    /\(\s*'(sms_[a-z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\s*\)/g,
  ),
].map((m) => ({
  slug: m[1],
  name: unquote(m[2]),
  head: unquote(m[3]),
  vars: JSON.parse(unquote(m[4])) as string[],
  body: `${unquote(m[3])} ${CLOSING}`,
}));

Deno.test("the seven Field Line templates are the ones in the migration", () => {
  assertEquals(TEMPLATES.map((t) => t.slug).sort(), [...EXPECTED_SLUGS].sort());
});

Deno.test("the closing line is defined once and ends every body", () => {
  assert(
    /rates may apply/i.test(CLOSING) && /HELP/.test(CLOSING) &&
      /STOP/.test(CLOSING),
    `the closing line must carry rates, HELP and STOP: "${CLOSING}"`,
  );
  // Defined once: it is appended by the migration, never typed into a body.
  const typedIn = TEMPLATES.filter((t) => t.head.includes(CLOSING));
  assertEquals(typedIn.map((t) => t.slug), [], "no body may carry its own copy");
  for (const t of TEMPLATES) {
    assert(t.body.endsWith(CLOSING), `${t.slug} must end with the closing line`);
  }
});

Deno.test("the studio's name comes first in every body", () => {
  for (const t of TEMPLATES) {
    assert(
      t.body.startsWith(t.slug === "sms_selection" ? "{{selection}}" : "{{studio_name}}"),
      `${t.slug} opens with "${t.body.slice(0, 32)}…" — the studio comes first`,
    );
  }
});

Deno.test("only the opt-in invite names Patina, and it carries Reply YES {{code}}", () => {
  for (const t of TEMPLATES) {
    const namesUs = /\bPatina\b/.test(t.body);
    assertEquals(
      namesUs,
      t.slug === "sms_optin_invite",
      `${t.slug} ${namesUs ? "must not" : "must"} name Patina`,
    );
  }
  const invite = TEMPLATES.find((t) => t.slug === "sms_optin_invite")!;
  assert(
    invite.body.includes("through Patina"),
    "the invite says who is relaying the message",
  );
  assert(
    invite.body.includes("Reply YES {{code}}"),
    "the invite renders the S1 reply grammar",
  );
});

Deno.test("the delivery confirm carries its ref", () => {
  const confirm = TEMPLATES.find((t) => t.slug === "sms_delivery_confirm")!;
  assert(confirm.body.includes("Ref {{ref}}"), "the delivery confirm shows Ref NN");
});

Deno.test("every body is GSM-7 and fits two segments at maximum parameters", () => {
  for (const t of TEMPLATES) {
    const rendered = render(t.body);
    const { count, illegal } = septetsOf(rendered);
    assertEquals(
      illegal,
      [],
      `${t.slug} carries non-GSM-7 characters ${JSON.stringify(illegal)} — ` +
        "one of them turns the whole message into 70-character UCS-2 segments",
    );
    assert(
      count <= TWO_SEGMENTS,
      `${t.slug} is ${count} septets at maximum parameters (limit ${TWO_SEGMENTS})`,
    );
  }
});

// ── The SQ-36 digest-budget regression (R3) ─────────────────────────────────
// Review SQ-36 rendered the real producer against candidate ad27e846 and got
// 319 septets out of a 306 budget, because nothing capped the menu. R3 is the
// reviewer's own assertion; the case after it is the same measurement taken in
// septets, with a studio name written in GSM-7 extension characters.

const DIGEST = TEMPLATES.find((t) => t.slug === "sms_daily_digest")!;

function renderWith(body: string, params: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_whole, key: string) => params[key] ?? "");
}

Deno.test("R3 actual digest menu must fit the claimed SMS budget", () => {
  const menu = buildDigestMenu(
    [{ id: "1", kind: "task", title: "I".repeat(40), project_id: "p", due: "2026-09-17" }],
    "2026-09-17",
  );
  const rendered = renderWith(DIGEST.body, {
    studio_name: "S".repeat(24),
    project_name: "P".repeat(24),
    menu: menu.menuText,
    link: `https://client.patina.cloud/field/${"a".repeat(64)}`,
  });
  assert(
    rendered.length <= TWO_SEGMENTS,
    `actual GSM-basic digest is ${rendered.length} septets`,
  );
});

Deno.test("the real digest fits two segments at every maximum at once", () => {
  // Three items, each a 40-character title due today: more than the menu can
  // hold, which is the point — the producer is what keeps this inside 306.
  const menu = buildDigestMenu(
    ["I", "J", "K"].map((c, i) => ({
      id: `t${i}`,
      kind: "task" as const,
      title: c.repeat(40),
      project_id: "p",
      due: "2026-09-17",
    })),
    "2026-09-17",
  );
  const rendered = renderWith(DIGEST.body, {
    // 12 extension characters = the same 24 septets a 24-letter name spends.
    studio_name: "[".repeat(12),
    project_name: "P".repeat(24),
    menu: menu.menuText,
    link: `https://client.patina.cloud/field/${"a".repeat(64)}`,
  });
  const { count, illegal } = septetsOf(rendered);
  assertEquals(illegal, [], `the digest carries ${JSON.stringify(illegal)}`);
  assertEquals(septetsOf("[".repeat(12)).count, 24, "extension characters cost two");
  assert(
    count <= TWO_SEGMENTS,
    `the rendered digest is ${count} septets at maximum parameters: "${rendered}"`,
  );
  assert(
    menu.menuText.endsWith("+2 more"),
    `the dropped items must be counted: "${menu.menuText}"`,
  );
});

Deno.test("no body sounds like software", () => {
  for (const t of TEMPLATES) {
    const hit = t.body.match(BLACKLIST);
    assertEquals(hit, null, `${t.slug} says "${hit?.[0]}"`);
    assertEquals(t.body.match(AI_WORD), null, `${t.slug} says "AI"`);
  }
});

Deno.test("each template declares exactly the parameters its body uses", () => {
  for (const t of TEMPLATES) {
    const used = [
      ...new Set(
        [...t.body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]),
      ),
    ].sort();
    assertEquals(
      [...t.vars].sort(),
      used,
      `${t.slug}: the variables column and the body disagree`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// The homeowner's copy (migration 00652, US-3 P24)
// ═══════════════════════════════════════════════════════════════════════════
// Same four readers as the trade copy, and a fifth: a HOMEOWNER, who never
// asked for a project-management tool and does not know what a gate, a task or
// a workspace is. She gets three texts in her whole relationship with the rail
// — a letter, a list of picks, a delivery window — so each one has to read like
// a sentence her designer would say out loud.
//
// 00652 does not retype the closing line: it READS the shipped one back out of
// sms_selection and refuses to apply if it cannot find it. So the bodies below
// are measured against 00641's constant, which is the same line, and the
// read-back guard itself is asserted rather than assumed.

const CLIENT_MIGRATION = new URL(
  "../../migrations/00652_field_line_client_templates.sql",
  import.meta.url,
);
const CLIENT_START = "-- <<< FIELD LINE CLIENT COPY BLOCK";
const CLIENT_END = "-- >>> FIELD LINE CLIENT COPY BLOCK";

/** The homeowner's capability URL, measured the way the trade link is:
 *  CLIENT_PORTAL_URL + "/auth/invite/" + the 64-hex token create_client_link
 *  mints (00650:290). 104 septets of the 306 before a word of copy — six more
 *  than the trade link, which is why it is measured per slug instead of moving
 *  the global budget: sms_daily_digest is EXACTLY 306 at its own maxima. */
const CLIENT_LINK = `https://client.patina.cloud/auth/invite/${"a".repeat(64)}`;

const CLIENT_MAX_PARAM: Record<string, string> = {
  ...MAX_PARAM,
  link: CLIENT_LINK,
  studio_name: "S".repeat(24),
  project_name: "P".repeat(24),
  // field-daily caps a batch at five picks; two digits is room to spare.
  picks: "99 picks",
  room: "R".repeat(24),
  item_title: "I".repeat(24),
  option_a: "A".repeat(14),
  option_b: "B".repeat(14),
  ref: "999",
};

const CLIENT_SLUGS = [
  "sms_client_first_letter",
  "sms_selection_ready",
  "sms_window_pick",
];

/**
 * THE WORDS A HOMEOWNER IS NEVER SENT. Two kinds: software vocabulary she has
 * no use for (dashboard, workspace, platform, portal, magic link, AI), and the
 * rail's own internal nouns and verbs — a "gate" is a thing the code does, a
 * "task" belongs to the crew, "accept" and "collaborate" and "welcome" are what
 * a SaaS onboarding says to a user. She is not a user; she is a person whose
 * living room is being furnished.
 */
const HOMEOWNER_BLACKLIST =
  /\b(gate|gates|task|tasks|dashboard|welcome|accept|accepts|accepted|collaborate|collaboration|workspace|platform|portal|account|accounts|magic[- ]?link|invite|invitation|onboard|onboarding|sign[- ]?in|log[- ]?in)\b/i;

const clientSql = await Deno.readTextFile(CLIENT_MIGRATION);
const clientBlock = clientSql.slice(
  clientSql.indexOf(CLIENT_START) + CLIENT_START.length,
  clientSql.indexOf(CLIENT_END),
);
assert(
  clientBlock.length > 0,
  "the client copy block markers must bracket the templates",
);

const CLIENT_TEMPLATES: Template[] = [
  ...clientBlock.matchAll(
    /\(\s*'(sms_[a-z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\s*\)/g,
  ),
].map((m) => ({
  slug: m[1],
  name: unquote(m[2]),
  head: unquote(m[3]),
  vars: JSON.parse(unquote(m[4])) as string[],
  body: `${unquote(m[3])} ${CLOSING}`,
}));

function renderClient(body: string): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
    const value = CLIENT_MAX_PARAM[key];
    assert(value !== undefined, `no documented maximum for {{${key}}} (${whole})`);
    return value;
  });
}

Deno.test("the three client templates are the ones in 00652", () => {
  assertEquals(CLIENT_TEMPLATES.map((t) => t.slug).sort(), [...CLIENT_SLUGS].sort());
});

Deno.test("00652 reads the shipped closing line back instead of retyping it", () => {
  assert(
    /FROM\s+public\.email_templates\s+WHERE\s+slug\s*=\s*'sms_selection'/
      .test(clientSql),
    "the closing line must come from the template that already carries it",
  );
  assert(
    /RAISE EXCEPTION '00652: the canonical Field Line closing line/.test(clientSql),
    "a migration that cannot read the closing line must refuse to apply",
  );
  for (const t of CLIENT_TEMPLATES) {
    assert(
      !t.head.includes(CLOSING) && !/rates may apply/i.test(t.head),
      `${t.slug} must not carry its own copy of the closing line`,
    );
    assert(t.body.endsWith(CLOSING), `${t.slug} must end with the closing line`);
  }
});

Deno.test("the studio's name comes first in every client body", () => {
  for (const t of CLIENT_TEMPLATES) {
    assert(
      t.body.startsWith("{{studio_name}}"),
      `${t.slug} opens with "${t.body.slice(0, 32)}…" — the studio comes first`,
    );
  }
});

Deno.test("no client body names Patina or asks her to join anything", () => {
  for (const t of CLIENT_TEMPLATES) {
    assertEquals(
      /\bPatina\b/.test(t.body),
      false,
      `${t.slug} names Patina — her studio is the one writing to her`,
    );
    assertEquals(
      /join/i.test(t.body),
      false,
      `${t.slug} asks her to join something`,
    );
  }
});

Deno.test("no client body uses the rail's own vocabulary", () => {
  for (const t of CLIENT_TEMPLATES) {
    const hit = t.body.match(HOMEOWNER_BLACKLIST);
    assertEquals(hit, null, `${t.slug} says "${hit?.[0]}"`);
    assertEquals(t.body.match(AI_WORD), null, `${t.slug} says "AI"`);
    // Plain words, and the shortest that will do: no body may be a paragraph.
    assertEquals(
      /[;—]/.test(t.head),
      false,
      `${t.slug} is punctuated like a document, not a text`,
    );
  }
});

Deno.test("the client grammar is the one the reply parser reads", () => {
  const letter = CLIENT_TEMPLATES.find((t) => t.slug === "sms_client_first_letter")!;
  const picks = CLIENT_TEMPLATES.find((t) => t.slug === "sms_selection_ready")!;
  const window = CLIENT_TEMPLATES.find((t) => t.slug === "sms_window_pick")!;
  // The letter is a link and nothing else to answer: it asks for no reply, so it
  // must not print a reference the parser would then have to resolve.
  assert(letter.body.includes("{{link}}"), "the first letter carries the letter");
  assertEquals(
    /\{\{\s*ref\s*\}\}/.test(letter.body),
    false,
    "the first letter asks nothing, so it prints no reference",
  );
  // "YES NN" is exactly what pipeline.ts binds to approve_selection, and the
  // link beside it is the same answer by hand.
  assert(
    picks.body.includes("Reply YES {{ref}}"),
    `the picks text must print the S1 reply grammar: "${picks.body}"`,
  );
  assert(picks.body.includes("{{link}}"), "she can always open it instead");
  // A, B or C, and the reference the three letters are answered with.
  for (const letterOption of ["A", "B", "C"]) {
    assert(
      new RegExp(`\\b${letterOption}\\b`).test(window.body),
      `the delivery card must offer ${letterOption}`,
    );
  }
  assert(
    window.body.includes("Ref {{ref}}"),
    `the delivery card must show Ref NN: "${window.body}"`,
  );
  assert(
    /neither/i.test(window.body),
    "C must be named as what it is: neither of those works",
  );
});

Deno.test("every client body is GSM-7 and fits two segments at maximum parameters", () => {
  for (const t of CLIENT_TEMPLATES) {
    const rendered = renderClient(t.body);
    const { count, illegal } = septetsOf(rendered);
    assertEquals(
      illegal,
      [],
      `${t.slug} carries non-GSM-7 characters ${JSON.stringify(illegal)}`,
    );
    assert(
      count <= TWO_SEGMENTS,
      `${t.slug} is ${count} septets at maximum parameters (limit ${TWO_SEGMENTS}): "${rendered}"`,
    );
  }
});

Deno.test("each client template declares exactly the parameters its body uses", () => {
  for (const t of CLIENT_TEMPLATES) {
    const used = [
      ...new Set(
        [...t.body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]),
      ),
    ].sort();
    assertEquals(
      [...t.vars].sort(),
      used,
      `${t.slug}: the variables column and the body disagree`,
    );
  }
});
