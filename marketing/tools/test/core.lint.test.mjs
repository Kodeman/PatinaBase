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

function lint(text, kind, name = "piece.md") {
  const file = path.join(
    dir,
    `${kind}-${Math.random().toString(36).slice(2)}-${name}`,
  );
  fs.writeFileSync(file, text);
  const r = spawnSync(
    process.execPath,
    [LINT, file, "--kind", kind, "--claims", CLAIMS, "--json"],
    { encoding: "utf8" },
  );
  return { code: r.status, report: JSON.parse(r.stdout), stderr: r.stderr };
}

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
      "Studios save 40% of their week [C01]. Founded in 1998, open since 2026. The pulls moved. [C01]",
    ),
    "social",
  );
  assert.equal(code, 0, JSON.stringify(report.errors));
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
