/**
 * PP-3 / R139 — the rest rule, gated at the CSS level.
 *
 * An action whose rule only appears on hover is not an affordance: a touch
 * screen has no hover, so the whole tertiary tier read as plain text on the
 * device Leah actually carries (IX03 / IX04 / B01). The house sheet's answer
 * (§A5, amended §F-D) is that every tier's rest rule is unconditional — no
 * `scaleX(0)`, no `@media (hover:none)` variant.
 *
 * eslint reads `.ts`/`.tsx` only and no stylelint config exists in this repo,
 * so nothing but this suite can see a rule that hides itself at rest. It reads
 * globals.css the way `shadow-gate.test.ts` does. It once named one remaining
 * exception (`.da-score-hover`); that rule now rests visible too, so the
 * contract is simply that there is none.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const GLOBALS_CSS = join(__dirname, "../../../app/globals.css");

const source = readFileSync(GLOBALS_CSS, "utf8");
/** Comments quote CSS prose ("scaleX(0) to scaleX(1)"); strip them first. */
const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  selector: string;
  body: string;
}

/** Every top-level and at-rule-nested rule, as selector + declaration body. */
function rules(css: string): Rule[] {
  const found: Rule[] = [];
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = RULE.exec(css)) !== null) {
    const selector = match[1]!.trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue;
    found.push({ selector, body: match[2]! });
  }
  return found;
}

const ALL_RULES = rules(stripped);

/** A rest rule is one no state pseudo-class gates. */
const STATE =
  /:(hover|active|focus|focus-visible|focus-within|disabled|checked)\b/;

function restRulesTouching(pattern: RegExp): Rule[] {
  return ALL_RULES.filter(
    (rule) => pattern.test(rule.selector) && !STATE.test(rule.selector),
  );
}

/** The Scored Ink grammar: the control, its parts, and the six tiers. */
const ACTION_SELECTOR =
  /\.da-(act|hit|pool|label|leading|trailing|primary|secondary|tertiary|danger|inked|terminal)\b/;

describe("PP-3 · the rest rule is unconditional", () => {
  it("reads globals.css and finds the Scored Ink block", () => {
    expect(ALL_RULES.length).toBeGreaterThan(100);
    expect(restRulesTouching(ACTION_SELECTOR).length).toBeGreaterThan(10);
  });

  it("hides no DocumentAction rest rule behind scaleX(0)", () => {
    const hidden = restRulesTouching(ACTION_SELECTOR)
      .filter((rule) => /transform\s*:[^;]*scaleX\(\s*0\s*\)/.test(rule.body))
      .map((rule) => rule.selector);
    expect(hidden).toEqual([]);
  });

  it("leaves NO .da-* rest rule drawn at scaleX(0) — the exception is gone", () => {
    // `.da-score-hover` — the ad-hoc score kit worn by ~30 non-DocumentAction
    // controls — was the one rule this suite used to name as a frozen
    // exception. It now rests visible like every other tier, so the list is
    // empty and a re-introduced scaleX(0) rest fails here by name.
    const hidden = restRulesTouching(/\.da-/)
      .filter((rule) => /transform\s*:[^;]*scaleX\(\s*0\s*\)/.test(rule.body))
      .map((rule) => rule.selector);
    expect(hidden).toEqual([]);
  });

  it("rests the ad-hoc score on aged oak and raises it to clay", () => {
    const [rest] = restRulesTouching(/^\.da-score-hover::after$/);
    expect(rest).toBeDefined();
    expect(rest!.body).toMatch(
      /background-color:\s*var\(--color-aged-oak\)/,
    );
    expect(rest!.body).not.toMatch(/scaleX/);

    const raised = ALL_RULES.find(
      (rule) =>
        /\.da-score-hover:hover::after/.test(rule.selector) &&
        /\.da-score-hover:focus-visible::after/.test(rule.selector),
    );
    expect(raised).toBeDefined();
    expect(raised!.body).toMatch(/background-color:\s*var\(--color-clay\)/);
  });

  it("rests the tertiary and secondary scores on aged oak", () => {
    const scored = restRulesTouching(
      /^\.da-(tertiary|secondary) \.da-label::before$/,
    );
    expect(scored).toHaveLength(2);
    for (const rule of scored) {
      expect(rule.body).toMatch(/background-color:\s*var\(--color-aged-oak\)/);
    }
  });

  it("draws the roster row score at rest, in aged oak", () => {
    const [row] = restRulesTouching(/^\.row-wash-score::after$/);
    expect(row).toBeDefined();
    expect(row!.body).toMatch(/background:\s*var\(--color-aged-oak\)/);
    expect(row!.body).not.toMatch(/scaleX/);
  });

  it("gives every act a focus outline beside the proofreader’s caret", () => {
    const focus = ALL_RULES.find(
      (rule) => rule.selector === ".da-act:focus-visible",
    );
    expect(focus).toBeDefined();
    expect(focus!.body).toMatch(/outline:\s*2px solid var\(--color-clay-ink\)/);
    expect(focus!.body).toMatch(/outline-offset:\s*2px/);
    // The caret is the mark, the outline is the ring — R139 keeps both.
    expect(stripped).toMatch(
      /\.da-act:focus-visible::before\s*\{[^}]*opacity:\s*1/,
    );
  });

  it("dims no act with opacity — faint ink at full opacity instead (B07)", () => {
    const dimmed = ALL_RULES.filter(
      (rule) =>
        ACTION_SELECTOR.test(rule.selector) &&
        /:disabled|\[aria-disabled/.test(rule.selector) &&
        /opacity\s*:\s*0?\.\d/.test(rule.body),
    );
    expect(dimmed).toEqual([]);
  });

  it("fills the terminal tier and prints its label in Inter, not mono caps", () => {
    const label = ALL_RULES.find(
      (rule) => rule.selector === ".da-terminal .da-label",
    );
    expect(label).toBeDefined();
    expect(label!.body).toMatch(/font-family:\s*var\(--font-body\)/);
    expect(label!.body).toMatch(/font-size:\s*16px/);
    expect(label!.body).toMatch(/text-transform:\s*none/);
    expect(label!.body).toMatch(/font-variant-numeric:\s*tabular-nums/);

    const box = ALL_RULES.find((rule) => rule.selector === ".da-terminal");
    expect(box).toBeDefined();
    expect(box!.body).toMatch(/background-color:\s*var\(--color-charcoal\)/);
    expect(box!.body).toMatch(/min-height:\s*48px/);
    expect(box!.body).toMatch(/border-radius:\s*3px/);
    expect(box!.body).not.toMatch(/box-shadow/);
  });

  it("draws the unavailable terminal act's silhouette back in (§A5)", () => {
    // The fill retreats to rail stock, so without a hairline the tier stops
    // reading as terminal — the sheet's "keeps its ROLE while unavailable".
    const unavailable = ALL_RULES.find((rule) =>
      /^\.da-terminal:disabled, ?\.da-terminal\[aria-disabled='true'\]$/.test(
        rule.selector,
      ),
    );
    expect(unavailable).toBeDefined();
    expect(unavailable!.body).toMatch(
      /background-color:\s*var\(--doc-rail-stock\)/,
    );
    expect(unavailable!.body).toMatch(/border:\s*1px solid var\(--/);
  });

  it("presses the terminal tier on the shared act clock (§A5)", () => {
    // Every tier, terminal included, wears .da-act (document-action.tsx
    // BASE_CLASS), so the sheet's .act--terminal:active press is this rule.
    const press = ALL_RULES.find((rule) => rule.selector === ".da-act:active");
    expect(press).toBeDefined();
    expect(press!.body).toMatch(/transform:\s*translateY\(1px\)/);
    expect(press!.body).toMatch(/var\(--press-in\)/);
    // and nothing in the terminal tier takes that press back.
    const taken = ALL_RULES.filter(
      (rule) =>
        /\.da-terminal\b/.test(rule.selector) &&
        /(^|[;{\s])transform\s*:/.test(rule.body),
    ).map((rule) => rule.selector);
    expect(taken).toEqual([]);
  });
});
