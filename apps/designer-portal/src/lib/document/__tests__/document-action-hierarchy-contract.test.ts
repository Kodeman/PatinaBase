/**
 * Inked Instruments hierarchy contracts (I91).
 *
 * These source-level checks follow the existing Document grammar-contract
 * precedent: the behavior tests exercise the primitive itself, while this file
 * prevents the named surfaces from quietly drifting back to one-off buttons or
 * competing primaries.
 */

import { existsSync, readFileSync } from "fs";
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
