import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const LINT = path.join(here, "..", "voice-lint.mjs");
const SAMPLE = path.join(here, "fixtures", "run-sample");
const CLAIMS = path.join(SAMPLE, "claims.md");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "press-lint-"));

function lint(text, kind, name = "piece.md", claims = CLAIMS) {
  const file = path.join(
    dir,
    `${kind}-${Math.random().toString(36).slice(2)}-${name}`,
  );
  fs.writeFileSync(file, text);
  const r = spawnSync(
    process.execPath,
    [LINT, file, "--kind", kind, "--claims", claims, "--json"],
    { encoding: "utf8" },
  );
  return { code: r.status, report: JSON.parse(r.stdout), stderr: r.stderr };
}

// A claims table whose verified row states a number, for the claim-number-match rule.
const NUMERIC_CLAIMS = path.join(dir, "numeric-claims.md");
fs.writeFileSync(
  NUMERIC_CLAIMS,
  [
    "| id | claim | source | status |",
    "|---|---|---|---|",
    "| C01 | A studio in the sample saved 40% of its week and logged 1,200 hours. | fixture | verified |",
    "| C02 | A studio cuts its proposal turnaround in half. | pending | todo |",
    "",
  ].join("\n"),
);

const U = (...codes) => String.fromCharCode(...codes);

const social = (body, fm = "headline: A studio note\nhashtags:\n  - studio") =>
  `---\n${fm}\n---\n\n${body}\n`;

const failing = [
  [
    "AI-powered",
    social("An AI-powered studio."),
    "social",
    "ai-powered",
    "AI-powered",
  ],
  [
    "pledge",
    social("We make a pledge to every studio."),
    "social",
    "pledge",
    "pledge",
  ],
  [
    "Where Time Adds Value",
    social("Where Time Adds Value."),
    "social",
    "held-tagline",
    "Where Time Adds Value",
  ],
  [
    "curated",
    social("A curated set of pieces."),
    "social",
    "curated",
    "curated",
  ],
  ["New York", social("A studio in New York."), "social", "place", "New York"],
  [
    "uncited 40%",
    social("Studios save 40% of their week."),
    "social",
    "uncited-number",
    "40%",
  ],
  [
    "todo claim [C02]",
    social("Turnaround halves. [C02]"),
    "social",
    "unverified-claim",
    "[C02]",
  ],
  // SQ-606 seam-1 probes that slipped the first gate (finding ids in the labels).
  ["F1.1 A.I. dotted", social("Built with A.I. for studios."), "social", "ai", "A.I"],
  ["F1.1 fullwidth AI", social(`${U(0xff21, 0xff29)} for studios.`), "social", "ai", "AI"],
  ["F1.1 title-case Ai", social("Ai That Works For You."), "social", "ai", "Ai"],
  ["F1.1 zero-width A I", social(`A${U(0x200b)}I for studios.`), "social", "ai", "AI"],
  ["F1.1 word joiner A I", social(`A${U(0x2060)}I for studios.`), "social", "ai", "AI"],
  ["F1.1 GenAI", social("GenAI tools for studios."), "social", "ai", "GenAI"],
  ["F1.1 Cyrillic A", social(`${U(0x0410)}I for studios.`), "social", "ai", "AI"],
  ["F1.1 Greek A and I", social(`${U(0x0391, 0x0399)} for studios.`), "social", "ai", "AI"],
  [
    "F1.2 artificial-intelligence",
    social("artificial-intelligence for studios."),
    "social",
    "artificial-intelligence",
    "artificial-intelligence",
  ],
  [
    "F1.2 artificial nbsp intelligence",
    social(`artificial${U(0xa0)}intelligence for studios.`),
    "social",
    "artificial-intelligence",
    "artificial intelligence",
  ],
  [
    "F1.2 machine-learning",
    social("machine-learning for studios."),
    "social",
    "machine-learning",
    "machine-learning",
  ],
  [
    "F1.2 powered non-breaking-hyphen by",
    social(`powered${U(0x2011)}by Patina.`),
    "social",
    "powered-by",
    `powered${U(0x2010)}by`,
  ],
  ["F1.2 powered-by", social("powered-by Patina."), "social", "powered-by", "powered-by"],
  ["F1.3 curate", social("We curate rooms."), "social", "curated", "curate"],
  ["F1.3 curation", social("A curation of rooms."), "social", "curated", "curation"],
  ["F1.3 luxurious", social("Luxurious rooms."), "social", "luxury", "Luxurious"],
  [
    "F1.4 royalties",
    social("Designers earn teaching royalties."),
    "social",
    "royalty",
    "royalties",
  ],
  ["F1.4 royalty", social("A royalty on every piece."), "social", "royalty", "royalty"],
  [
    "F1.4 giving back",
    social("Giving back on every sale."),
    "social",
    "giving-back",
    "Giving back",
  ],
  [
    "F1.4 pay it forward",
    social("Studios pay it forward."),
    "social",
    "pay-it-forward",
    "pay it forward",
  ],
  [
    "F1.5 tagline nbsp, lower case",
    social(`Where time${U(0xa0)}adds value.`),
    "social",
    "held-tagline",
    "Where time adds value",
  ],
  [
    "F1.5 tagline across a headline break",
    social("Where Time\nAdds Value"),
    "social",
    "held-tagline",
    "Where Time\nAdds Value",
  ],
  [
    "F1.5 tagline without where",
    social("Time adds value here."),
    "social",
    "held-tagline",
    "Time adds value",
  ],
  [
    "F1.7 marker across list lines",
    social("- 40 hours back every month\n- Built in Madison [C01]"),
    "social",
    "uncited-number",
    "40 hours",
  ],
  [
    "F1.7 marker across a headline newline",
    social("40 hours back every month\nBuilt in Madison [C01]"),
    "social",
    "uncited-number",
    "40 hours",
  ],
  [
    "F1.8 cited claim does not state the number",
    social("Studios save 40 hours a week [C01]."),
    "social",
    "claim-number-mismatch",
    "40 hours",
  ],
  ["F1.9 2k", social("Save 2k a month."), "social", "uncited-number", "2k"],
  ["F1.9 3x", social("Studios move 3x faster."), "social", "uncited-number", "3x"],
  ["F1.9 3.5x", social("Studios move 3.5x faster."), "social", "uncited-number", "3.5x"],
  ["F1.9 $2k", social("Save $2k a month."), "social", "uncited-number", "$2k"],
  [
    "F1.9 5 percent",
    social("Save 5 percent of your week."),
    "social",
    "uncited-number",
    "5 percent",
  ],
  ["F1.9 3 days", social("Install in 3 days."), "social", "uncited-number", "3 days"],
  ["F1.9 No.10", social("Studio No.10 in Madison."), "social", "uncited-number", "10"],
  [
    "F1.9 1,200 hours",
    social("Studios log 1,200 hours a year."),
    "social",
    "uncited-number",
    "1,200 hours",
  ],
  ["F1.10 L.A.", social("Studios in L.A., today."), "social", "place", "L.A"],
  ["F1.10 LA", social("Studios in LA today."), "social", "place", "LA"],
  ["F1.10 SF", social("Studios in SF today."), "social", "place", "SF"],
  ["F1.10 Bay Area", social("Studios in the Bay Area."), "social", "place", "Bay Area"],
  ["F1.10 Aspen", social("A chalet in Aspen."), "social", "place", "Aspen"],
  ["F1.10 Boston", social("A brownstone in Boston."), "social", "place", "Boston"],
  ["F1.10 Seattle", social("A loft in Seattle."), "social", "place", "Seattle"],
  ["F1.10 Austin", social("A ranch near Austin."), "social", "place", "Austin"],
  ["F1.10 SoHo", social("A loft in soho."), "social", "place", "soho"],
  ["F1.10 Tribeca", social("A loft in Tribeca."), "social", "place", "Tribeca"],
  ["F1.10 Malibu", social("A house in Malibu."), "social", "place", "Malibu"],
  ["F1.10 Palm Beach", social("A villa in Palm Beach."), "social", "place", "Palm Beach"],
  ["F1.10 nyc lower case", social("Studios in nyc."), "social", "place", "nyc"],
  [
    "F1.13 numeric frontmatter scalar",
    "---\nheadline: h\nsubhead: 1200\nbody: b\nvisual: J01\n---\n",
    "poster",
    "uncited-number",
    "1200",
  ],
];

for (const [label, text, kind, rule, match] of failing) {
  test(`voice-lint fails on ${label}`, () => {
    const { code, report } = lint(text, kind);
    assert.equal(code, 1);
    assert.ok(
      report.errors.some((e) => e.rule === rule && e.match === match),
      `expected ${rule} ${match}, got ${JSON.stringify(report.errors)}`,
    );
  });
}

test("voice-lint fails a social piece with 5 hashtags", () => {
  const fm =
    "headline: Five tags\nhashtags:\n  - one\n  - two\n  - three\n  - four\n  - five";
  const { code, report } = lint(social("A studio note.", fm), "social");
  assert.equal(code, 1);
  assert.ok(
    report.errors.some(
      (e) => e.rule === "hashtags" && e.match.startsWith("5 hashtags"),
    ),
  );
});

test("voice-lint fails an email subject of 61 chars", () => {
  const subject = "S".repeat(61);
  const { code, report } = lint(
    `---\nsubject: ${subject}\npreheader: hi\n---\n\nA note.\n`,
    "email",
  );
  assert.equal(code, 1);
  assert.ok(
    report.errors.some(
      (e) => e.rule === "subject-length" && e.match.startsWith("61 chars"),
    ),
  );
});

test("voice-lint fails a 151-word pitch and passes a 150-word one", () => {
  const words = (n) => Array.from({ length: n }, () => "word").join(" ");
  const over = lint(
    `---\nsubject: A pitch\n---\n\n${words(151)}\n`,
    "pr-pitch",
  );
  assert.equal(over.code, 1);
  assert.ok(
    over.report.errors.some(
      (e) => e.rule === "pitch-words" && e.match.startsWith("151 words"),
    ),
  );
  const at = lint(`---\nsubject: A pitch\n---\n\n${words(150)}\n`, "pr-pitch");
  assert.equal(at.code, 0, JSON.stringify(at.report.errors));
});

test("voice-lint passes cited numbers, years, and lone [Cnn] markers", () => {
  const { code, report } = lint(
    social(
      "Studios save 40% of their week [C01]. Founded in 1998, open since 2026. The pulls moved. [C01]\n- 1,200 hours logged [C01]",
    ),
    "social",
    "piece.md",
    NUMERIC_CLAIMS,
  );
  assert.equal(code, 0, JSON.stringify(report.errors));
});

test("voice-lint fails a number the cited claim does not state (F1.8)", () => {
  const { code, report } = lint(
    social("Studios save 45% of their week [C01]."),
    "social",
    "piece.md",
    NUMERIC_CLAIMS,
  );
  assert.equal(code, 1);
  assert.deepEqual(
    report.errors.map((e) => [e.rule, e.match]),
    [["claim-number-mismatch", "45%"]],
  );
});

test("voice-lint flags hashtags YAML swallowed as comments (F1.12)", () => {
  const fm =
    "headline: h\ncaption: c\nhashtags:\n  - #one\n  - #two\n  - #three\n  - #four\n  - #five\n  - #six\nalt: a";
  const { code, report } = lint(social("Body.", fm), "social");
  assert.equal(code, 1);
  assert.ok(
    report.errors.some(
      (e) => e.rule === "hashtags" && e.match.startsWith("6 hashtags"),
    ),
    JSON.stringify(report.errors),
  );
  const unquoted = report.errors.find((e) => e.rule === "hashtag-unquoted");
  assert.ok(unquoted, JSON.stringify(report.errors));
  assert.match(unquoted.match, /[Qq]uote/);
  assert.equal(unquoted.line, 4);
  // Quoted tags parse as strings and pass.
  const ok = lint(
    social("Body.", 'headline: h\nhashtags:\n  - "#one"\n  - "#two"'),
    "social",
  );
  assert.equal(ok.code, 0, JSON.stringify(ok.report.errors));
});

test("voice-lint reports malformed frontmatter as a frontmatter error (F1.14)", () => {
  const { code, report } = lint(
    "---\nheadline: [unclosed\ncaption: c\n---\nBody.\n",
    "social",
  );
  assert.equal(code, 1);
  assert.ok(
    report.errors.some((e) => e.rule === "frontmatter"),
    JSON.stringify(report.errors),
  );
});

test("voice-lint skips a leading provenance comment and keeps file line numbers (F1.15)", () => {
  const header =
    '<!-- provenance: single-shot via local model gateway; response model=claude-gpt-6-sol[1m]; stop_reason=end_turn; usage={"input_tokens":1234,"output_tokens":56}; images=0; generated 2026-10-08T12:34:56.789Z -->';
  const text = [
    header, // 1
    "", // 2
    "---", // 3
    "headline: A studio note", // 4
    "caption: A curated wall.", // 5
    "hashtags:", // 6
    "  - one", // 7
    "  - two", // 8
    "  - three", // 9
    "  - four", // 10
    "  - five", // 11
    "---", // 12
    "", // 13
    "A studio in Miami.", // 14
  ].join("\n");
  const { code, report } = lint(text, "social");
  assert.equal(code, 1);
  assert.deepEqual(
    report.errors.map((e) => [e.rule, e.match, e.line]),
    [
      ["hashtags", "5 hashtags (max 4)", 1],
      ["curated", "curated", 5],
      ["place", "Miami", 14],
    ],
  );
  const clean = lint(`${header}\n\n${social("A studio note.")}`, "social");
  assert.equal(clean.code, 0, JSON.stringify(clean.report.errors));
});

test("voice-lint warns on near-misses without failing the piece (F1.4, F1.6, F1.9, F1.11)", () => {
  const { code, report } = lint(
    social(
      "Our ML and LLM chatbot brings automation. A studio driven by Designer-Taught Intelligence. Get forty hours back. Our promise to the studio. Homeowners love it, built for homeowners and makers.",
    ),
    "social",
  );
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.deepEqual(
    report.warnings.map((w) => [w.rule, w.match]).sort(),
    [
      ["ml", "ML"],
      ["llm", "LLM"],
      ["chatbot", "chatbot"],
      ["automation", "automation"],
      ["driven-by", "driven by"],
      ["spelled-quantity", "forty hours"],
      ["promise", "promise"],
      ["audience", "for homeowners"],
      ["audience", "Homeowners love"],
    ].sort(),
  );
});

test("voice-lint does not flag ordinary words near the stricter rules", () => {
  const { code, report } = lint(
    social(
      "We aim for what she said: the Aisle runs down Main Street. Il est là, la table. An aspen veneer, a 3-day install, a 2x4 frame, a 5 x 7 rug.",
    ),
    "social",
  );
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.deepEqual(report.warnings, []);
});

test("voice-lint treats video scene seconds as layout, not copy (F1.13)", () => {
  const { code, report } = lint(
    "---\ntitle: t\nscenes:\n  - seconds: 12\n    visual: J01\n    onscreen: The hire picks up the pulls\n    vo: One page.\n---\n",
    "video",
  );
  assert.equal(code, 0, JSON.stringify(report.errors));
});

test("voice-lint --json prints a lint-crashed verdict and exits 2 when it throws (F2.6)", () => {
  const missing = path.join(dir, "no-such-piece.final.md");
  const r = spawnSync(process.execPath, [LINT, missing, "--json"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.file, missing);
  assert.match(report.fatal, /ENOENT/);
  assert.equal(report.errors[0].rule, "lint-crashed");
});

test("voice-lint passes the canon's good examples", () => {
  const voice = fs.readFileSync(
    path.join(here, "..", "..", "canon", "voice.md"),
    "utf8",
  );
  const section = voice.slice(
    voice.indexOf("## 10. Good and bad"),
    voice.indexOf("## 11."),
  );
  const good = [...section.matchAll(/- Good: "([^"]*)"/g)].map((m) =>
    m[1].replace(/\s+/g, " "),
  );
  assert.equal(good.length, 5);
  const canonClaims = path.join(here, "..", "..", "canon", "claims.md");
  for (const line of good) {
    const r = lint(social(line), "social", "piece.md", canonClaims);
    assert.deepEqual(r.report.errors, [], line);
  }
});

test("voice-lint lints frontmatter values recursively and reports file line numbers", () => {
  const text = [
    "---", // 1
    "title: A deck", // 2
    "slides:", // 3
    "  - headline: Before", // 4
    "    body: A curated wall.", // 5
    "---", // 6
    "", // 7
    "First line.", // 8
    "A studio in Miami.", // 9
  ].join("\n");
  const { code, report } = lint(text, "deck");
  assert.equal(code, 1);
  assert.deepEqual(
    report.errors.map((e) => [e.rule, e.match, e.line]),
    [
      ["curated", "curated", 5],
      ["place", "Miami", 9],
    ],
  );
});

test("voice-lint warns on bespoke and on more than one exclamation", () => {
  const { code, report } = lint(
    social("A bespoke chair! A second line!"),
    "social",
  );
  assert.equal(code, 0);
  assert.deepEqual(report.warnings.map((w) => w.rule).sort(), [
    "bespoke",
    "exclamations",
    "exclamations",
  ]);
});

test("voice-lint passes the run-sample fixture finals in directory mode, kind from plan.json", () => {
  const r = spawnSync(
    process.execPath,
    [LINT, path.join(SAMPLE, "copy"), "--claims", CLAIMS, "--json"],
    {
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const reports = JSON.parse(r.stdout);
  assert.equal(reports.length, 8);
  assert.deepEqual(
    reports.map((x) => x.kind),
    [
      "social",
      "pin",
      "email",
      "one-pager",
      "deck",
      "pr-pitch",
      "poster",
      "video",
    ],
  );
  for (const x of reports) assert.deepEqual(x.errors, [], x.file);
});
