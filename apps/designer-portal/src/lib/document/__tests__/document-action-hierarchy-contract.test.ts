/**
 * Inked Instruments hierarchy contracts (I91).
 *
 * These source-level checks follow the existing Document grammar-contract
 * precedent: the behavior tests exercise the primitive itself, while this file
 * prevents the named surfaces from quietly drifting back to one-off buttons or
 * competing primaries.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..");
const COMPONENTS = join(SRC, "components", "document");
const DOCUMENT_ROUTES = join(SRC, "app", "(document)");
const readComponent = (file: string) =>
  readFileSync(join(COMPONENTS, file), "utf8");
const readRoute = (file: string) =>
  readFileSync(join(DOCUMENT_ROUTES, file), "utf8");

function actionRegion(
  source: string,
  regionKey: string,
  tag: "DocumentActionGroup" | "DocumentActionRow" = "DocumentActionGroup",
): string {
  const keyAt = source.indexOf(`regionKey="${regionKey}"`);
  expect(keyAt).toBeGreaterThanOrEqual(0);
  const start = source.lastIndexOf(`<${tag}`, keyAt);
  const end = source.indexOf(`</${tag}>`, keyAt);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(keyAt);
  return source.slice(start, end + tag.length + 3);
}

function expectOneStaticPrimary(region: string): void {
  expect(region.match(/variant="primary"/g) ?? []).toHaveLength(1);
}

const desk = readRoute("desk/page.tsx");
const letterhead = readComponent("letterhead-instruments.tsx");
const proposalDraft = readComponent("proposal-instruments.tsx");
const proposalWatch = readComponent("proposal-watch.tsx");
const library = readComponent("rooms/library/library-room.tsx");
const people = readComponent("people/people-room.tsx");
const profileShell = readComponent("people/profile/profile-shell.tsx");
const makerProfile = readComponent("people/profile/maker-profile.tsx");
const drafting = readComponent("rooms/drafting/drafting-room.tsx");
const work = readComponent("work-block.tsx");
const captureLead = readComponent("overlays/capture-lead-sheet.tsx");
const invoiceComposer = readComponent("accounts/invoice-composer.tsx");

describe("I91 shared action grammar", () => {
  it("retires the typography-only Instrument implementation", () => {
    expect(existsSync(join(COMPONENTS, "instrument.tsx"))).toBe(false);
    expect(desk).toContain("from '@/components/document/document-action'");
  });

  it("keeps one static primary in each stable page-head and form region", () => {
    [
      actionRegion(desk, "desk-error"),
      actionRegion(letterhead, "letterhead-actions"),
      actionRegion(letterhead, "letterhead-message", "DocumentActionRow"),
      actionRegion(proposalDraft, "proposal-draft-actions"),
      actionRegion(library, "room-head"),
      actionRegion(captureLead, "capture-lead-sheet"),
    ].forEach(expectOneStaticPrimary);
  });

  it("routes invoice draft refusals through ActFailLine, not a bespoke error region (US-35 SQ-1019)", () => {
    expect(invoiceComposer).not.toContain('regionKey="invoice-draft-error"');
    expect(invoiceComposer).toContain("<ActFailLine");
  });

  it("leaves the People head with no filled act (US-28 S10, uplift (c) area 4: Add contact is secondary)", () => {
    const region = actionRegion(people, "room-head");
    expect(region.match(/variant="primary"/g) ?? []).toHaveLength(0);
    expect(region).toMatch(/actionKey="add-person"\s+variant="secondary"/);
  });

  it("leaves the Desk head with no filled act (US-28 S0 F1, U-Q3: Record an inquiry is secondary)", () => {
    expect(actionRegion(desk, "desk-head").match(/variant="primary"/g) ?? []).toHaveLength(0);
  });

  it("keeps proposal-watch leadership mutually exclusive", () => {
    const region = actionRegion(proposalWatch, "proposal-watch-actions");
    // I140 — one leader per table. The act is still the region's only
    // leadership claim and still gated on `signable`; on the Finalize table the
    // head's derived leader carries the weight, so the variant is a ternary
    // rather than a literal. Spelled out here so a drift back to a second,
    // ungated primary still bites.
    expect(region).toMatch(
      /\{signable && \(\s*<DocumentAction[\s\S]*?variant=\{onFinalizeTable \? 'secondary' : 'primary'\}/,
    );
    expect(region).toContain('actionKey="mark-proposal-signed"');
  });

  it("retires Revise and Send in favor of guidance copy (no new legacy sending)", () => {
    expect(proposalWatch).not.toContain('actionKey="revise-proposal"');
    expect(proposalWatch).not.toContain("ReviseSheet");
    expect(proposalWatch).toContain(
      "Changes now travel as a design services agreement.",
    );
    expect(proposalDraft).not.toContain('actionKey="send-proposal"');
    expect(proposalDraft).not.toContain("SendSheet");
    expect(drafting).not.toContain('actionKey="send-proposal"');
    expect(drafting).not.toContain("actionKey: 'send-proposal'");
    // RoomShell already renders its own way out (I107 — "the way out is a
    // word, not a box") on every breakpoint; the Room threads its label
    // rather than duplicating the act as a second, >1180px-only action.
    expect(drafting).not.toContain('actionKey="exit-drafting-room"');
    expect(drafting).toContain("backLabel={exitLabel}");
  });

  it("keeps task commits primary and retires legacy section sign-off creation", () => {
    expect(work).toContain('actionKey="add-task"');
    expect(work).toMatch(/actionKey="create-task"[\s\S]*?variant="primary"/);
    expect(work).not.toContain('actionKey="request-signoff"');
    expect(work).not.toContain('actionKey="submit-signoff-request"');
    expect(work).not.toContain('actionKey="request-signoff-again"');
  });

  it("adapts People profile actions to one role-led primary", () => {
    expect(profileShell).toContain(
      "variant={tone === 'dark' ? 'primary' : 'secondary'}",
    );
    // W2b — person-profile.tsx no longer renders a ProfileShell action row at
    // all: the four role-branched documents collapsed into one person card
    // whose acts are DocumentActions inside their own regions. MakerProfile is
    // the one surviving branch, so its role-led primary is what this still
    // pins.
    expect(makerProfile.match(/tone="dark"/g) ?? []).toHaveLength(1);
    expect(profileShell).toContain('regionKey="profile-actions"');
  });

  it("registers Room-head leadership with the mobile shell", () => {
    for (const source of [
      letterhead,
      proposalDraft,
      proposalWatch,
      library,
      people,
      drafting,
    ]) {
      expect(source).toContain("useMobilePrimaryAction");
    }
    expect(drafting).toContain("useMobilePrimaryAction(null);");
  });

  // A9: the Desk deliberately opts out of this contract now — its one
  // on-screen "Capture a lead" is the header primary at every viewport, and
  // the mobile dock falls back to its documented default (the "In hand /
  // Today" glance) instead of a second, duplicate registration.
  it("keeps the Desk out of the mobile-shell primary-action contract (A9)", () => {
    expect(desk).not.toContain("useMobilePrimaryAction");
  });
});

/**
 * The Project, Composed — a region's leadership lives in its ledger's ORDER,
 * not in a variant a caller spells. RegionHead scores index 0 and nothing else,
 * so a region that has adopted it must not carry a hand-written `primary` in
 * its head, nor spell `'inked'` in the ledger it passes.
 *
 * The per-region assertions are conditional on the file having adopted
 * RegionHead — they pass vacuously until a region lane lands, and bite the
 * moment it does.
 */
const PROJECT_REGION_FILES = [
  "approvals/project-approval-document.tsx",
  "schedule/schedule-spine.tsx",
  "ffe-section.tsx",
  "commercial/money-region.tsx",
  "project-mood-boards.tsx",
  "care-band.tsx",
] as const;

/** The `actions={[...]}` / `actions: [...]` ledger literals in a source file. */
function ledgerLiterals(source: string): string[] {
  const found: string[] = [];
  const opener = /actions(?:=\{|:\s*)\[/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === "[") depth += 1;
      else if (source[i] === "]") {
        depth -= 1;
        if (depth === 0) {
          found.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return found;
}

/**
 * US-43 R5 — the scored word's grammar in globals.css. jsdom applies no
 * stylesheet, so the CSS half of the grammar is pinned at the source: the
 * scored tiers, US-46 R203's charcoal Next plate (which retired US-43's
 * dark ground and its on-dark inks), and the §A11 forced-colors block.
 */
const globalsCss = readFileSync(join(SRC, "app", "globals.css"), "utf8");
const scoredInkBlock = globalsCss.slice(
  globalsCss.indexOf("/* The Scored Ink (I107)"),
  globalsCss.indexOf("/* ── stilled"),
);

function cssRule(selectorFragment: string, source = scoredInkBlock): string {
  const at = source.indexOf(selectorFragment);
  expect(at).toBeGreaterThanOrEqual(0);
  return source.slice(at, source.indexOf("}", at) + 1);
}

describe("US-43 R5 scored-word grammar (globals.css)", () => {
  it("retires the dark ground: no on-dark inks and no [data-ground] rule (US-46 R203)", () => {
    expect(globalsCss).not.toMatch(/--on-dark-[a-z]+\s*:/);
    expect(globalsCss).not.toMatch(/--focus-on-dark\s*:/);
    expect(globalsCss).not.toContain("[data-ground");
    expect(globalsCss).toMatch(/--focus-ring:\s*var\(--color-clay-ink\);/);
  });

  it("sets no caps, mono face or tracking on any scored tier but the terminal label", () => {
    const withoutTerminalLabel = scoredInkBlock.replace(cssRule(".da-terminal .da-label {"), "");
    expect(withoutTerminalLabel).not.toMatch(/text-transform:\s*uppercase/);
    expect(withoutTerminalLabel).not.toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(withoutTerminalLabel).not.toMatch(/letter-spacing:\s*0?\.\d/);
    expect(withoutTerminalLabel).not.toMatch(/font-weight:\s*300/);
  });

  it("keeps the 44px target and both scores under the word", () => {
    const act = cssRule(".da-act {");
    expect(act).toContain("min-width: 44px");
    expect(act).toContain("min-height: 44px");
    expect(scoredInkBlock).toMatch(/\n\.da-label::before \{\s*bottom:\s*-\d/);
    expect(scoredInkBlock).toMatch(/\n\.da-label::after \{\s*bottom:\s*-\d/);
  });

  it("paints the Next plate charcoal, 32px on a 44px target, unscored, 2px radius — never forest (US-46 R203)", () => {
    // the control: the honest 44px target, no paint of its own
    const plate = cssRule(".da-plate {");
    expect(plate).toContain("color: var(--ink-paper)");
    expect(plate).toContain("min-height: 44px");
    expect(plate).toContain("padding: 6px 20px");
    expect(plate).not.toContain("background");
    // the paint: inset 6px top and bottom, so 44 − 12 = 32px visible
    const paint = cssRule(".da-plate::after {");
    expect(paint).toContain("inset: 6px 0");
    expect(paint).toContain("background-color: var(--ink)");
    expect(paint).toContain("border-radius: 2px");
    expect(paint).toContain("pointer-events: none");
    expect(`${plate}${paint}`).not.toContain("forest");
    // no clay score: both of the label's scores are switched off
    expect(scoredInkBlock).toMatch(/\.da-plate \.da-label::before,\s*\.da-plate \.da-label::after\s*\{\s*content:\s*none;/);
    // hover and press deepen the paint to the deck's #1F1D1A
    expect(cssRule(".da-plate:hover::after,")).toContain("background-color: #1F1D1A");
    // focus: the box's ring is off, and the shared ring is drawn on the paint
    expect(cssRule(".da-plate:focus-visible,")).toContain("outline: none !important");
    const focus = cssRule(".da-plate:focus-visible::after,");
    expect(focus).toContain("outline: 2px solid var(--focus-ring)");
    expect(focus).toContain("outline-offset: 0");
    // held or disabled: rail stock with its edge drawn back in, as the terminal
    expect(cssRule(".da-plate:disabled::after,")).toContain("background-color: var(--doc-rail-stock)");
    // the forest terminal is untouched by the plate
    expect(cssRule(".da-terminal {")).toContain("background-color: var(--color-forest)");
  });

  // US-46 F2 — the paint is the target inset on ::after, so it covers the
  // label only while the inset is no deeper than the plate's block padding: a
  // wrapped label then grows the target and the paint together, never pale
  // text past the paint onto the paper.
  it("keeps the plate's paint inset within its block padding, so a wrapped label stays on the paint", () => {
    const plate = cssRule(".da-plate {");
    const padding = plate.match(/padding:\s*(\d+)(?:px)?\s+\d+px;/);
    expect(padding).not.toBeNull();
    const blockPadding = Number(padding![1]);
    const paint = cssRule(".da-plate::after {");
    const inset = paint.match(/inset:\s*(\d+)px\s+0;/);
    expect(inset).not.toBeNull();
    const paintInset = Number(inset![1]);
    expect(paintInset).toBeLessThanOrEqual(blockPadding);
    // …and the one-line plate is unchanged: 44px target over 32px of paint.
    expect(44 - 2 * paintInset).toBe(32);
  });

  it("sets the plate's label in Inter 15 semibold sentence case, and counts it as the region's lead", () => {
    const action = readComponent("document-action.tsx");
    expect(action).toContain(
      "plate: 'da-plate font-body text-[15px] font-semibold normal-case tracking-normal'",
    );
    expect(action).toContain("const LEADER_VARIANTS: readonly DocumentActionVariant[] = ['primary', 'plate'];");
  });

  it("prints the band's two Next acts as the plate, and the dock's copy of that Next too", () => {
    const band = readComponent("lens-band.tsx");
    expect(band.match(/variant="plate"/g) ?? []).toHaveLength(2);
    expect(band).not.toContain('variant="primary"');
    expect(band).not.toContain("data-ground");
    const dock = readComponent("mobile/mobile-bar.tsx");
    expect(dock).toContain("variant: bandsNext ? ('plate' as const) : ('primary' as const)");
    expect(dock).not.toContain("data-ground");
  });

  it("carries the §A11 forced-colors rules without un-forcing the text", () => {
    const at = scoredInkBlock.indexOf("@media (forced-colors: active)");
    expect(at).toBeGreaterThanOrEqual(0);
    const block = scoredInkBlock.slice(at, scoredInkBlock.indexOf("\n}\n", at) + 2);
    expect(cssRule(".da-label::after {", block)).toMatch(/forced-color-adjust:\s*none/);
    expect(cssRule(".da-label::after {", block)).toContain("background-color: CanvasText");
    expect(cssRule(".da-terminal {", block)).toContain("border: 1px solid ButtonText");
    expect(cssRule(".da-plate::after {", block)).toContain("border: 1px solid ButtonText");
    expect(cssRule(".da-plate:focus-visible::after,", block)).toContain("outline: 2px solid Highlight");
    expect(block).toMatch(/\.da-act:focus-visible[^{]*\{\s*outline: 2px solid Highlight/);
    // only the scores opt out — never the act or its word
    expect(block.match(/forced-color-adjust:\s*none/g) ?? []).toHaveLength(1);
  });
});

describe("Project region ledgers", () => {
  it.each(PROJECT_REGION_FILES)(
    "%s keeps its head free of a hand-spelled leader",
    (file) => {
      const path = join(COMPONENTS, file);
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, "utf8");
      if (!source.includes("region/region-head")) return;
      expect(source).not.toContain('variant="primary"');
      for (const ledger of ledgerLiterals(source)) {
        expect(ledger).not.toContain("'inked'");
        expect(ledger).not.toContain('"inked"');
      }
    },
  );

  // US-43 R4 — the leading entry is the one scored lead (`primary`, unfilled)
  // unless its caller declares a variant; nothing is inked any more.
  it("scores the leading ledger entry and only the leading one", () => {
    const head = readFileSync(
      join(COMPONENTS, "region", "region-head.tsx"),
      "utf8",
    );
    expect(head.match(/'primary'/g) ?? []).toHaveLength(2);
    // US-19 499-2 / F2-12 (P-1): a head may declare it has no leader at all;
    // when it has one, it is still entry 0 and only entry 0. US-46 B: that
    // lead stands on its own line; every later entry prints on the tools row.
    expect(head).toContain("const leads = leaderProp && !leaderless;");
    expect(head).toContain("const leadEntry = leads ? printedActions[0] : undefined;");
    expect(head).toContain(
      "const toolEntries = leadEntry ? printedActions.slice(1) : printedActions;",
    );
    expect(head).toContain("renderEntry(leadEntry, leadEntry.variant ?? 'primary')");
    expect(head).toContain("renderEntry(entry, entry.variant ?? 'secondary')");
    expect(head.match(/renderEntry\(/g) ?? []).toHaveLength(2);
    // the other occurrence is the dev guard that catches a caller trying to
    // spell leadership on a later entry — not a second place it is granted.
    expect(head).toContain("return declared === 'primary';");
    expect(head).not.toContain("'inked'");
    // US-25 Q8's band context is gone: the band no longer demotes the lead.
    expect(head).not.toContain("BandLeadsContext");
  });
});

/**
 * P02 (Kody 2026-10-23; house sheet SPEC §H-3; token-mapping §6–§7.2).
 *
 * Inside `[data-paper-renderer="round8"]` the filled navigation and save
 * controls are the R203 plate, unchanged but for its geometry; terminal
 * commercial and signature acts keep the forest terminal and their §A6
 * consequence sentence. Every round-8 rule lives in round8.css, which only
 * the round-8 renderer imports, so globals.css — and with it the scored-ink
 * slice every R203 / R5 assertion above reads — carries none of it.
 */
const ROUND8_SCOPE = '[data-paper-renderer="round8"]';
const round8CssPath = join(COMPONENTS, "paper", "round8.css");
const round8Css = existsSync(round8CssPath) ? readFileSync(round8CssPath, "utf8") : "";

/** Where round-8 components live (token-mapping §7.2 item 4), plus the
 *  frame's own `frame/round8-*` files. */
const ROUND8_SOURCE_DIRS = [join(COMPONENTS, "paper"), join(COMPONENTS, "studio")];
const ROUND8_FRAME_DIR = join(COMPONENTS, "frame");

/**
 * token-mapping §6.1, frozen: file (relative to components/document) → the
 * plate actionKeys it may print. Empty until WP-02/03/04 name their keys
 * against the enumerated sites: the studio cover note, library placement and
 * resource handoffs; the chapter acts for Brief & agreement, Design,
 * Cabinetry, Approvals, FF&E and Financials; one foot act per unfolded
 * instrument. A plate not listed here fails until the map and §6.1 change
 * together.
 */
const ROUND8_PLATE_SITES: Readonly<Record<string, readonly string[]>> = Object.freeze({});

/** §6.2 — a plate never sends, issues, pays, signs, accepts, authorises,
 *  dispatches, voids or approves. Anchored to a kebab segment's start, so a
 *  `design` key is not read as `sign`. */
const CONSEQUENTIAL_KEY = /(^|-)(send|issue|pay|sign|accept|authori[sz]e|dispatch|void|approve)/;

function round8SourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  ROUND8_SOURCE_DIRS.forEach(walk);
  if (existsSync(ROUND8_FRAME_DIR)) {
    for (const name of readdirSync(ROUND8_FRAME_DIR)) {
      if (/^round8-.*\.tsx?$/.test(name)) out.push(join(ROUND8_FRAME_DIR, name));
    }
  }
  return out;
}

/** Each `<DocumentAction …>` opening element (not Group / Row), read to the
 *  `>` that closes it at brace depth zero, so an arrow's `=>` inside a prop
 *  does not end it early. */
function documentActionElements(source: string): string[] {
  const found: string[] = [];
  const opener = /<DocumentAction(?![A-Za-z])/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    for (let i = match.index; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) {
        found.push(source.slice(match.index, i + 1));
        break;
      }
    }
  }
  return found;
}

/** Every DocumentActionGroup / DocumentActionRow in a source, open to close. */
function actionRegions(source: string): string[] {
  const found: string[] = [];
  for (const tag of ["DocumentActionGroup", "DocumentActionRow"]) {
    const opener = new RegExp(`<${tag}(?![A-Za-z])`, "g");
    let match: RegExpExecArray | null;
    while ((match = opener.exec(source)) !== null) {
      const end = source.indexOf(`</${tag}>`, match.index);
      if (end > match.index) found.push(source.slice(match.index, end));
    }
  }
  return found;
}

interface CssRule {
  selector: string;
  body: string;
}

/** Top-level and @media-nested rules of a comment-stripped sheet. */
function cssRules(css: string): CssRule[] {
  const found: CssRule[] = [];
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = RULE.exec(css)) !== null) {
    const selector = match[1]!.trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue;
    found.push({ selector, body: match[2]!.trim().replace(/\s+/g, " ") });
  }
  return found;
}

/** Selector list items, never split inside `:is(…)`. */
function selectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") depth -= 1;
    else if (selector[i] === "," && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts;
}

describe("P02 round-8 plate (Kody 2026-10-23)", () => {
  const strippedRound8 = round8Css.replace(/\/\*[\s\S]*?\*\//g, "");
  const round8Rules = cssRules(strippedRound8);

  const ts = require("typescript") as typeof import("typescript");
  type Element = import("typescript").JsxElement | import("typescript").JsxSelfClosingElement;

  function jsxElements(source: string): Element[] {
    const elements: Element[] = [];
    const visit = (node: import("typescript").Node): void => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile("round8.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
    return elements;
  }

  function attribute(element: Element, name: string) {
    const opening = ts.isJsxElement(element) ? element.openingElement : element;
    const property = opening.attributes.properties.find(
      (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === name,
    );
    return property && ts.isJsxAttribute(property) ? property.initializer : undefined;
  }

  function hasLiteralVariants(source: string): boolean {
    const spelled = source.match(/(['"])(plate|terminal)\1/g)?.length ?? 0;
    const literal = source.match(/variant="(plate|terminal)"/g)?.length ?? 0;
    const computed = jsxElements(source).some((element) => {
      const opening = ts.isJsxElement(element) ? element.openingElement : element;
      const variant = attribute(element, "variant");
      return opening.tagName.getText() === "DocumentAction" && variant !== undefined && !ts.isStringLiteral(variant);
    });
    // Keep the ledger ban as well as rejecting expressions with no quoted tier.
    return !computed && spelled === literal;
  }

  function descriptionKey(value: import("typescript").JsxAttributeValue | undefined): string | undefined {
    if (!value) return undefined;
    const expression = ts.isJsxExpression(value) ? value.expression : value;
    if (!expression) return undefined;
    if (ts.isStringLiteral(expression)) return expression.text.trim() ? `text:${expression.text}` : undefined;
    return `expression:${expression.getText()}`;
  }

  function hasSentence(element: import("typescript").JsxElement | import("typescript").JsxFragment): boolean {
    return element.children.some((child) => {
      if (ts.isJsxText(child)) return child.text.trim().length > 0;
      if (ts.isJsxElement(child) || ts.isJsxFragment(child)) return hasSentence(child);
      if (ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression)) {
        return child.expression.text.trim().length > 0;
      }
      return false;
    });
  }

  function unboundTerminals(source: string): string[] {
    const elements = jsxElements(source);
    const sentences = new Set(elements
      .filter((element) => ts.isJsxElement(element) && hasSentence(element))
      .map((element) => descriptionKey(attribute(element, "id")))
      .filter((key) => key !== undefined));
    return elements.flatMap((element) => {
      const opening = ts.isJsxElement(element) ? element.openingElement : element;
      const variant = attribute(element, "variant");
      if (opening.tagName.getText() !== "DocumentAction" || !variant || !ts.isStringLiteral(variant) || variant.text !== "terminal") return [];
      const describedBy = descriptionKey(attribute(element, "aria-describedby"));
      const key = attribute(element, "actionKey");
      return describedBy && sentences.has(describedBy) ? [] : [key && ts.isStringLiteral(key) ? key.text : "(no actionKey)"];
    });
  }

  it.each([
    ["computed prop carrying plate and a consequential key", '<DocumentActionGroup><DocumentAction variant={variant} actionKey="send-invoice"/><DocumentAction variant={variant} actionKey="pay-invoice"/></DocumentActionGroup>'],
    ["computed call", '<DocumentAction variant={chooseVariant()} actionKey="send-invoice"/>'],
    ["computed string literal", '<DocumentAction variant={"plate"} actionKey="save"/>'],
  ])("rejects %s", (_name, source) => {
    expect(hasLiteralVariants(source)).toBe(false);
  });

  it.each([
    ["data-id target", '<p data-id={sentenceId}>This sends the invoice.</p>'],
    ["self-closing target", '<span id={sentenceId}/>'],
    ["empty paired target", '<span id={sentenceId}></span>'],
    ["whitespace target", '<span id={sentenceId}>  \n </span>'],
    ["comment-only target", '<span id={sentenceId}>{/* sentence goes here */}</span>'],
  ])("rejects terminal with %s", (_name, target) => {
    const source = `const view = <><DocumentAction variant="terminal" actionKey="send-invoice" aria-describedby={sentenceId}/>${target}</>`;
    expect(unboundTerminals(source)).toEqual(["send-invoice"]);
  });

  it.each(['""', '"   "', '{""}', '{"   "}'])(
    "rejects empty terminal aria-describedby=%s",
    (description) => {
      const source = `const view = <><DocumentAction variant="terminal" actionKey="send-invoice" aria-describedby=${description}/><p id=${description}>This sends the invoice.</p></>`;
      expect(unboundTerminals(source)).toEqual(["send-invoice"]);
    },
  );

  it.each([
    '<p id={sentenceId}>This sends the invoice.</p>',
    '<p id={sentenceId}>This <strong>sends</strong> the invoice.</p>',
  ])("accepts a terminal bound to a real consequence sentence: %s", (target) => {
    const source = `const view = <><DocumentAction variant="terminal" actionKey="send-invoice" aria-describedby={sentenceId}/>${target}</>`;
    expect(hasLiteralVariants(source)).toBe(true);
    expect(unboundTerminals(source)).toEqual([]);
  });

  it("accepts literal plate and primary variants for the other P02 checks", () => {
    expect(hasLiteralVariants('<DocumentActionGroup><DocumentAction variant="plate" actionKey="save"/><DocumentAction variant="primary" actionKey="next"/></DocumentActionGroup>')).toBe(true);
  });

  it("holds every round-8 rule in its own delimited sheet, none in globals.css", () => {
    expect(round8Css.trimStart().startsWith("/* Round 8 paper renderer (P02)")).toBe(true);
    expect(round8Css.trimEnd().endsWith("/* end Round 8 paper renderer */")).toBe(true);
    expect(round8Rules.length).toBeGreaterThan(0);
    // the scored-ink slice every R203 / R5 assertion reads stays legacy-only
    expect(scoredInkBlock).not.toContain("data-paper-renderer");
    expect(globalsCss).not.toContain("data-paper-renderer");
  });

  it("scopes every selector in the round-8 sheet to the round-8 renderer", () => {
    const unscoped = round8Rules
      .flatMap(({ selector }) => selectorList(selector))
      .filter((selector) => !selector.startsWith(ROUND8_SCOPE));
    expect(unscoped).toEqual([]);
  });

  it("restyles only the plate's geometry: inset 0 paint, ring 2px off it", () => {
    const actionRules = round8Rules.filter(({ selector }) => /\.da-/.test(selector));
    // the plate is the only tier round 8 touches — terminal, danger and the
    // scored primary keep their grammar byte for byte
    expect(strippedRound8).not.toMatch(/\.da-(terminal|danger|primary|secondary|tertiary)\b/);
    for (const { selector } of actionRules) {
      expect(new Set(selector.match(/\.da-[a-z-]+/g))).toEqual(new Set([".da-plate"]));
    }
    expect(actionRules).toEqual([
      { selector: `${ROUND8_SCOPE} .da-plate::after`, body: "inset: 0;" },
      {
        selector: `${ROUND8_SCOPE} .da-plate:focus-visible::after, ${ROUND8_SCOPE} .da-plate[data-held-focus-cue]::after`,
        body: "outline-offset: 2px;",
      },
    ]);
    const plateCss = actionRules.map(({ selector, body }) => `${selector}{${body}}`).join("");
    expect(plateCss).not.toMatch(/background|forest|transform/);
    // the override mirrors the legacy focus rule's selector list exactly
    expect(cssRule(".da-plate:focus-visible::after,")).toContain(".da-plate[data-held-focus-cue]::after");
  });

  it("keeps the frozen plate-site map free of a consequential act, and every listed file real", () => {
    for (const [file, keys] of Object.entries(ROUND8_PLATE_SITES)) {
      expect(existsSync(join(COMPONENTS, file))).toBe(true);
      for (const key of keys) expect(key).not.toMatch(CONSEQUENTIAL_KEY);
    }
    // the segment anchor reads the §6.2 verbs, not their letters inside a word
    expect("save-unsent-design-set").not.toMatch(CONSEQUENTIAL_KEY);
    expect("send-invoice").toMatch(CONSEQUENTIAL_KEY);
    expect("record-client-approves").toMatch(CONSEQUENTIAL_KEY);
  });

  it("prints a round-8 plate only at a frozen site, never for a consequential act", () => {
    const offences: string[] = [];
    for (const file of round8SourceFiles()) {
      const name = file.slice(COMPONENTS.length + 1);
      const allowed = ROUND8_PLATE_SITES[name] ?? [];
      for (const element of documentActionElements(readFileSync(file, "utf8"))) {
        if (!element.includes('variant="plate"')) continue;
        const key = element.match(/actionKey="([^"]+)"/)?.[1];
        if (!key) offences.push(`${name}: a plate with no literal actionKey`);
        else if (CONSEQUENTIAL_KEY.test(key)) offences.push(`${name}: ${key} is a consequential act`);
        else if (!allowed.includes(key)) offences.push(`${name}: ${key} is not a §6.1 plate site`);
      }
    }
    expect(offences).toEqual([]);
  });

  it("spells every round-8 plate and terminal as a literal variant the gate can read", () => {
    // A computed variant (`variant={x ? 'plate' : …}`) or a ledger entry would
    // slip past the site and consequence checks, so round-8 files write them
    // only as `variant="plate"` / `variant="terminal"` on a DocumentAction.
    const offences: string[] = [];
    for (const file of round8SourceFiles()) {
      const source = readFileSync(file, "utf8");
      if (!hasLiteralVariants(source)) offences.push(file.slice(COMPONENTS.length + 1));
    }
    expect(offences).toEqual([]);
  });

  it("keeps one leader (primary or plate) per round-8 action region", () => {
    const crowded: string[] = [];
    for (const file of round8SourceFiles()) {
      for (const region of actionRegions(readFileSync(file, "utf8"))) {
        const leaders = region.match(/variant="(primary|plate)"/g) ?? [];
        if (leaders.length > 1) crowded.push(`${file.slice(COMPONENTS.length + 1)}: ${leaders.length} leaders`);
      }
    }
    expect(crowded).toEqual([]);
  });

  it("binds every round-8 terminal to its §A6 consequence sentence", () => {
    // The sentence is the act's description: the terminal names it through
    // aria-describedby, and the same file renders the element carrying that id.
    const unbound: string[] = [];
    for (const file of round8SourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const key of unboundTerminals(source)) {
        unbound.push(`${file.slice(COMPONENTS.length + 1)}: ${key}`);
      }
    }
    expect(unbound).toEqual([]);
  });
});
