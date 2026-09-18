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
