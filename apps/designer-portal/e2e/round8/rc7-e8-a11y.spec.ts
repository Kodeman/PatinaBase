import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth";
import { adminDb } from "../helpers/supabase-admin";
import { psqlAsUserRow, psqlRun, psqlScalar } from "../helpers/psql";
import { e8OwnedStackSql } from "./rc7-e8-guard";

/**
 * RC-7 E8 — X05 keyboard-only processes and axe, on chromium (1440) and
 * webkit-iphone (390). Every step from the studio to the saved FF&E line and
 * back is driven through native tab order (Alt+Tab on WebKit, whose plain Tab
 * skips links) and Enter/Escape only: no click(), focus() or scroll rescue.
 * axe-core 4.11.1 is the copy already installed for admin-portal's
 * axe-playwright; it is evaluated in the page (no new dependency).
 *
 * Asserted on every axe surface: 0 critical violations and 0 serious
 * violations other than color-contrast. RC7-E8-2 separately asserts zero
 * color-contrast violations across every recorded surface.
 *
 * Focus indicator (WCAG 2.4.7), asserted at EVERY Tab stop of every walk, not
 * only at the destinations: the focused element matches :focus-visible and
 * paints an indicator that differs from its own unfocused paint, snapshotted
 * for every focusable element just before each key press. An indicator is a
 * painted outline or box-shadow on the element or its ::before/::after, or a
 * painted border change (installFocusProbe has the exact rules). Stops named
 * in KNOWN_NO_INDICATOR (RC7-E8-6) are recorded and asserted by their fixme.
 * Border-only indicators record their contrast against the ground
 * (observation O-5, not asserted). At each destination the control is also on screen
 * and not entirely obscured (2.4.11); a partly covered control is recorded as
 * observation O-1 (2.4.12, AAA), not asserted.
 */

const JOB = "f0180000-0000-4000-8000-000000000010";
const LIVING = "f0180000-0000-4000-8000-000000000011";
const LINE_NAME = "F01 Living Room selection 07";
const E7_OWNER = "rc7-e7-1@patina.test";
const F01_DESIGNER = process.env.DESIGNER_E2E_EMAIL ?? "designer@patina.dev";
const F01_DESIGNER_ID = "f0180000-0000-4000-8000-000000000002";
const OUT =
  process.env.PLAYWRIGHT_OUTPUT_DIR ??
  path.join(__dirname, "../../test-results/round8");
const adminRequire = createRequire(
  path.resolve(__dirname, "../../../admin-portal/package.json"),
);
const AXE = readFileSync(
  createRequire(adminRequire.resolve("axe-playwright")).resolve(
    "axe-core/axe.min.js",
  ),
  "utf8",
);

type AxeSummary = {
  surface: string;
  counts: Record<string, number>;
  violations: Array<{
    id: string;
    impact: string | null;
    nodes: number;
    targets: string[];
  }>;
  infiniteAnimations: string[];
};
const axeResults: AxeSummary[] = [];
const tabCounts: Record<string, number> = {};
const focusIndicators: Record<string, string> = {};
const stopsChecked: Record<string, number> = {};
/** Stops whose only indicator is a border change: the lowest border-vs-ground contrast seen (recorded, O-5). */
const borderIndicators: Record<string, number> = {};
/** Stops kept out of the gate by KNOWN_NO_INDICATOR, with their defect. */
const knownNoIndicator: Record<string, string> = {};

type StopCheck = {
  stop: string;
  indicator: string;
  failure: string | null;
  known: string | null;
  borderContrast: number | null;
};

/**
 * Stops whose missing indicator is a recorded defect: annotated, kept out of
 * the gate, and asserted by the RC7-E8-6 fixme.
 */
const KNOWN_NO_INDICATOR: ReadonlyArray<{ defect: string; selector: string }> =
  [
    {
      // DEFECT RC7-E8-6: the schedule's ghost "Name a phase" input sets
      // focus:outline-none and paints nothing in its place
      // (schedule/ghost-add-line.tsx:226).
      defect: "RC7-E8-6",
      selector: 'input[aria-label="Name a phase"]',
    },
  ];

/**
 * Installs window.__e8fp once per document: `snapshot()` records every
 * focusable element's unfocused paint (the active element keeps its earlier
 * entry); `check(known)` judges the focused element against that baseline.
 *
 * An indicator is any of: an outline, or a box-shadow, on the element or its
 * ::before/::after, that is painted (style not none, width ≥ 1px, colour alpha
 * > 0, box opacity > 0; for a shadow, a layer with alpha > 0 and a blur,
 * spread or offset) and differs from the same box unfocused; or a border side
 * that is painted and differs from unfocused (its contrast against the ground
 * is recorded, not asserted).
 */
function installFocusProbe() {
  const w = window as unknown as { __e8fp?: unknown };
  if (w.__e8fp) return;
  const alpha = (color: string) => {
    if (/transparent/.test(color)) return 0;
    const slash = color.match(/\/\s*([\d.]+%?)\s*\)/);
    if (slash)
      return slash[1].endsWith("%")
        ? parseFloat(slash[1]) / 100
        : parseFloat(slash[1]);
    const rgba = color.match(/rgba?\(([^)]*)\)/);
    if (rgba) {
      const parts = rgba[1].split(/[\s,]+/).filter(Boolean);
      return parts.length >= 4 ? parseFloat(parts[3]) : 1;
    }
    return 1;
  };
  type Box = {
    box: string;
    outline: string;
    outlineOn: boolean;
    shadow: string;
    shadowOn: boolean;
  };
  const SIDES = ["Top", "Right", "Bottom", "Left"] as const;
  // Painted: the box and its host are displayed, visible and not transparent.
  const displayed = (cs: CSSStyleDeclaration) =>
    cs.display !== "none" &&
    cs.visibility === "visible" &&
    parseFloat(cs.opacity) > 0;
  const paint = (el: Element) => {
    const boxes: Box[] = [];
    const hostShown = displayed(getComputedStyle(el));
    for (const pseudo of [null, "::before", "::after"]) {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === "none" || cs.content === "normal"))
        continue;
      const shown = hostShown && displayed(cs);
      boxes.push({
        box: pseudo ?? "",
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        outlineOn:
          shown &&
          cs.outlineStyle !== "none" &&
          parseFloat(cs.outlineWidth) >= 1 &&
          alpha(cs.outlineColor) > 0,
        shadow: cs.boxShadow,
        shadowOn:
          shown &&
          cs.boxShadow !== "none" &&
          cs.boxShadow.split(/,(?![^(]*\))/).some((layer) => {
            const color =
              layer.match(
                /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]+|transparent/i,
              )?.[0] ?? "currentcolor";
            const [x = 0, y = 0, blur = 0, spread = 0] =
              layer
                .replace(color, "")
                .match(/-?[\d.]+px/g)
                ?.map(parseFloat) ?? [];
            return (
              alpha(color) > 0 && (blur > 0 || spread > 0 || x !== 0 || y !== 0)
            );
          }),
      });
    }
    const cs = getComputedStyle(el);
    const border = SIDES.map((side) => {
      const width = cs.getPropertyValue(`border-${side.toLowerCase()}-width`);
      const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
      const color = cs.getPropertyValue(`border-${side.toLowerCase()}-color`);
      const on =
        hostShown &&
        parseFloat(width) >= 1 &&
        !/none|hidden/.test(style) &&
        alpha(color) > 0;
      return { side, text: `${width} ${style} ${color}`, color, on };
    });
    return { boxes, border };
  };
  const rgb = (color: string) =>
    (color.match(/[\d.]+/g) ?? ["255", "255", "255"]).slice(0, 3).map(Number);
  const luminance = (color: string) => {
    const [r, g, b] = rgb(color).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ground = (el: Element) => {
    for (let a: Element | null = el; a; a = a.parentElement) {
      const bg = getComputedStyle(a).backgroundColor;
      if (alpha(bg) >= 1) return bg;
    }
    return "rgb(255, 255, 255)";
  };
  const map = new WeakMap<Element, ReturnType<typeof paint>>();
  w.__e8fp = {
    snapshot() {
      const active = document.activeElement;
      for (const el of document.querySelectorAll(
        "a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]",
      ))
        if (el !== active) map.set(el, paint(el));
    },
    check(known: ReadonlyArray<{ defect: string; selector: string }>) {
      let el: Element | null = document.activeElement;
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      const ffe =
        document
          .querySelector('[data-paper-chapter="ffe"] [data-density]')
          ?.getAttribute("data-density") ?? "-";
      if (!el || el === document.body) return { trail: "body", check: null };
      const stop = `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30)}`;
      const trail = `${stop} y${Math.round(scrollY)} ffe=${ffe}`;
      if ((el.getRootNode() as ShadowRoot).host?.tagName === "NEXTJS-PORTAL")
        return {
          trail,
          check: {
            stop,
            indicator: "next dev overlay (not product)",
            failure: null,
            known: null,
            borderContrast: null,
          },
        };
      const now = paint(el);
      const base = map.get(el);
      const was = (box: string) => base?.boxes.find((b) => b.box === box);
      const outline = now.boxes.find(
        (b) =>
          b.outlineOn &&
          !(was(b.box)?.outlineOn && was(b.box)?.outline === b.outline),
      );
      const shadow = now.boxes.find(
        (b) =>
          b.shadowOn &&
          !(was(b.box)?.shadowOn && was(b.box)?.shadow === b.shadow),
      );
      const border = now.border.find(
        (side, i) => side.on && base?.border[i].text !== side.text,
      );
      const borderContrast = border
        ? Math.round(
            ((Math.max(luminance(border.color), luminance(ground(el))) + 0.05) /
              (Math.min(luminance(border.color), luminance(ground(el))) +
                0.05)) *
              100,
          ) / 100
        : null;
      const indicator = outline
        ? `outline${outline.box ? ` ${outline.box}` : ""} ${outline.outline.replace(/^\S+ /, "")}`
        : shadow
          ? `box-shadow${shadow.box ? ` ${shadow.box}` : ""} ${shadow.shadow.slice(0, 60)}`
          : border
            ? `border-${border.side.toLowerCase()} ${border.text} (${borderContrast}:1 on ground)`
            : `none (${now.boxes.map((b) => `${b.box || "element"} outline ${b.outline}; shadow ${b.shadow.slice(0, 40)}`).join(" | ")}; border ${now.border.map((s) => s.text).join(" / ")})`;
      const failure = !el.matches(":focus-visible")
        ? ":focus-visible does not match"
        : !base
          ? "no unfocused baseline was recorded"
          : outline || shadow || border
            ? null
            : `no painted indicator that differs from unfocused <${el.tagName.toLowerCase()} class="${String(el.getAttribute("class") ?? "").slice(0, 100)}">`;
      const knownDefect = failure
        ? (known.find((k) => el.matches(k.selector))?.defect ?? null)
        : null;
      return {
        trail,
        check: { stop, indicator, failure, known: knownDefect, borderContrast },
      };
    },
  };
}

type FocusProbe = {
  snapshot: () => void;
  check: (known: ReadonlyArray<{ defect: string; selector: string }>) => {
    trail: string;
    check: StopCheck | null;
  };
};
const probeSnapshot = () =>
  (window as unknown as { __e8fp: FocusProbe }).__e8fp.snapshot();
const probeCheck = (
  known: ReadonlyArray<{ defect: string; selector: string }>,
) => (window as unknown as { __e8fp: FocusProbe }).__e8fp.check(known);

/**
 * Before any axe call: no finite CSS transition, CSS animation or WAAPI
 * animation may be running or pending. axe composites opacity, so a mid-fade
 * frame reads as a lower-contrast colour (the lens line-2 turn read as
 * #a96a59 = terracotta-ink at α≈0.86). Two consecutive quiet polls are
 * required; on timeout the test fails with what was still animating.
 * Infinite animations never settle; they are recorded with the axe summary.
 */
async function settleAnimations(page: Page, surface: string) {
  const live = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" || a.pending)
        .map((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          const name =
            (a as CSSAnimation).animationName ??
            (a as CSSTransition).transitionProperty ??
            a.id ??
            "animation";
          return {
            what: `${a.constructor.name} ${name} on ${target ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}.${String(target.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}` : "?"}`,
            infinite: a.effect?.getTiming().iterations === Infinity,
          };
        }),
    );
  let quiet = 0;
  let last: Array<{ what: string; infinite: boolean }> = [];
  const deadline = Date.now() + 10_000;
  while (quiet < 2) {
    last = await live();
    if (last.every((a) => a.infinite)) quiet++;
    else quiet = 0;
    if (quiet >= 2) break;
    if (Date.now() > deadline)
      throw new Error(
        `${surface}: animations still running before axe after 10 s: ${JSON.stringify(last.filter((a) => !a.infinite))}`,
      );
    await page.waitForTimeout(100);
  }
  return last.map((a) => a.what);
}

async function runAxe(page: Page, surface: string, include?: string) {
  const infiniteAnimations = await settleAnimations(page, surface);
  await page.evaluate(AXE);
  const result = await page.evaluate(async (context) => {
    const run = (
      window as unknown as {
        axe: { run: (c: unknown, o: unknown) => Promise<any> };
      }
    ).axe.run;
    return run(context ? { include: [context] } : document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
      resultTypes: ["violations"],
    });
  }, include ?? null);
  const counts: Record<string, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  const violations = (result.violations as any[]).map((violation) => {
    counts[violation.impact ?? "minor"] =
      (counts[violation.impact ?? "minor"] ?? 0) + violation.nodes.length;
    return {
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 8).map((node: any) => {
        const data = node.any?.[0]?.data;
        const contrast = data?.contrastRatio
          ? ` ${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}:1 (${data.fontSize}, need ${data.expectedContrastRatio})`
          : "";
        return `${node.target.join(" ")}${contrast}`;
      }),
    };
  });
  const summary = { surface, counts, violations, infiniteAnimations };
  axeResults.push(summary);
  expect(result.testEngine?.version, "axe ran").toBe("4.11.1");
  return summary;
}

/** Critical and non-contrast serious violations fail immediately.
 * RC7-E8-2 checks contrast across all recorded surfaces. */
async function axe(page: Page, surface: string, include?: string) {
  const { counts, violations } = await runAxe(page, surface, include);
  expect(
    counts.critical,
    `${surface}: axe critical ${JSON.stringify(violations.filter((v) => v.impact === "critical"))}`,
  ).toBe(0);
  expect(
    violations.filter(
      (v) => v.impact === "serious" && v.id !== "color-contrast",
    ),
    `${surface}: axe serious other than color-contrast`,
  ).toEqual([]);
}

const tabKey = (page: Page) =>
  page.context().browser()?.browserType().name() === "webkit"
    ? "Alt+Tab"
    : "Tab";

/** Traverse native tab order from the reader's current place until the control holds focus. */
async function tabTo(
  page: Page,
  control: Locator,
  label: string,
  backwards = false,
  limit = 250,
  // strict: a KNOWN_NO_INDICATOR stop fails too (the RC7-E8-6 fixme).
  strict = false,
) {
  const key = backwards ? `Shift+${tabKey(page)}` : tabKey(page);
  const trail: string[] = [];
  const checks: StopCheck[] = [];
  let steps = 0;
  const deadline = Date.now() + 150_000;
  while (
    steps < limit &&
    Date.now() < deadline &&
    !(await control
      .evaluate((element) => element === document.activeElement, undefined, {
        timeout: 500,
      })
      .catch(() => false))
  ) {
    await page.evaluate(installFocusProbe);
    await page.evaluate(probeSnapshot);
    await page.keyboard.press(key);
    // Human pace: the paper's lens opens a quiet stop only once the
    // focus-driven scroll settles (use-lens-density.ts, L-9); a stop's
    // controls do not exist until then.
    await page.waitForTimeout(150);
    steps++;
    await page.evaluate(installFocusProbe);
    const stop = await page.evaluate(probeCheck, KNOWN_NO_INDICATOR);
    trail.push(stop.trail);
    if (stop.check) checks.push(stop.check);
  }
  tabCounts[label] = steps;
  stopsChecked[label] = checks.length;
  if (steps >= limit || Date.now() >= deadline)
    console.log(
      "[rc7-e8 focus trail]",
      test.info().project.name,
      label,
      JSON.stringify(trail.slice(-60)),
    );
  await expect(
    control,
    `${label}: reachable through native tab order`,
  ).toBeFocused();
  const seen = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      inViewport:
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        rect.right > 0 &&
        rect.left < innerWidth,
      // WCAG 2.4.11: what paints over the control at its centre and 4 inset corners
      // (k/5 covered; 5/5 = entirely hidden), and by which fixed/sticky layer.
      obscuredBy: (() => {
        const inset = (a: number, b: number) => Math.min(Math.max(a, 0), b - 1);
        const points = [
          [0.5, 0.5],
          [0.1, 0.15],
          [0.9, 0.15],
          [0.1, 0.85],
          [0.9, 0.85],
        ].map(([fx, fy]) => [
          inset(rect.left + rect.width * fx, innerWidth),
          inset(rect.top + rect.height * fy, innerHeight),
        ]);
        const covers = points
          .map(([x, y]) => document.elementFromPoint(x, y))
          .filter(
            (top) => top && !element.contains(top) && !top.contains(element),
          ) as Element[];
        if (!covers.length) return { covered: 0, by: null };
        const top =
          covers[0].closest('[data-job-head], header, nav, [role="dialog"]') ??
          covers[0];
        return {
          covered: covers.length,
          by: `${covers.length}/5 by ${top.tagName.toLowerCase()}${[
            ...top.attributes,
          ]
            .filter((a) => a.name.startsWith("data-"))
            .slice(0, 2)
            .map((a) => `[${a.name}]`)
            .join("")}`,
        };
      })(),
    };
  });
  // The destination is the walk's last stop (re-judged if no key was pressed).
  if (!checks.length) await page.evaluate(installFocusProbe);
  const destination =
    checks.at(-1) ??
    (await page.evaluate(probeCheck, KNOWN_NO_INDICATOR)).check;
  focusIndicators[label] = seen.obscuredBy.by
    ? `${destination?.indicator}; covered ${seen.obscuredBy.by}`
    : `${destination?.indicator}`;
  expect(seen.inViewport, `${label}: focused control is on screen`).toBe(true);
  // WCAG 2.4.7 at every stop of the walk, destination included: a painted
  // indicator the unfocused control does not have (installFocusProbe).
  expect(destination, `${label}: destination judged`).not.toBeNull();
  const judged = [
    ...checks,
    ...(steps === 0 && destination ? [destination] : []),
  ];
  for (const c of judged) {
    if (c.borderContrast !== null)
      borderIndicators[c.stop] = Math.min(
        borderIndicators[c.stop] ?? Infinity,
        c.borderContrast,
      );
    if (c.failure && c.known)
      knownNoIndicator[c.stop] = `${c.known}: ${c.failure}`;
  }
  expect(
    judged
      .filter((c) => c.failure && (strict || !c.known))
      .map((c) => `${c.stop}: ${c.failure} [${c.indicator}]`),
    `${label}: every Tab stop shows a visible focus indicator`,
  ).toEqual([]);
  // WCAG 2.4.11 (AA): not entirely hidden. Partly covered stays an observation (O-1, 2.4.12 AAA).
  expect(
    seen.obscuredBy.covered,
    `${label}: focused control not entirely obscured (${seen.obscuredBy.by})`,
  ).toBeLessThan(5);
  if (seen.obscuredBy.covered > 0)
    test.info().annotations.push({
      type: "O-1 partly obscured focus (2.4.12 AAA)",
      description: `${label}: ${seen.obscuredBy.by}`,
    });
}

async function arrivedStudio(page: Page) {
  await expect(page.locator('[data-studio="round8"]')).toHaveAttribute(
    "data-arrival-ready",
    "",
    { timeout: 60_000 },
  );
  await expect(page.locator("html")).not.toHaveClass(
    /\barr-(?:pre|on|press)\b/,
    { timeout: 30_000 },
  );
}

async function arrivedJob(page: Page) {
  await expect(
    page.locator("[data-document-shell][data-arrival-ready]"),
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator("html")).not.toHaveClass(
    /\barr-(?:pre|on|press)\b/,
    { timeout: 30_000 },
  );
}

async function signInAs(page: Page, email: string) {
  await page.goto("/auth/signin?callbackUrl=%2Fdesk", {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page
    .getByRole("button", {
      name: /sign in with email|use email and password instead|use a password instead/i,
    })
    .first()
    .click();
  await page.getByLabel(/email/i).first().fill(email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill("password123");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/desk/, { timeout: 60_000 });
}

const instrument = (page: Page) =>
  page.locator('[data-paper-chapter="ffe"] [data-unfold-instrument="pieces"]');

test.describe("RC-7 E8 X05 keyboard-only processes and axe", () => {
  test.setTimeout(300_000);

  // The keyboard save writes through the portal: never the shared stack, and
  // only when rc7_owned.stack names RC7_OWNED_STACK.
  test.beforeAll(async ({}, info) => {
    psqlRun(e8OwnedStackSql("rc7-e8 a11y keyboard save and private print"));
    const stamp = Date.now();
    const prefix = `${JOB}/plans/rc7-e8-a11y-${info.project.name}-${stamp}`;
    const bytes = readFileSync(path.resolve(__dirname, "../fixtures/whitlock-set.pdf"));
    const { error } = await adminDb.storage
      .from("project-documents")
      .upload(`${prefix}.pdf`, bytes, { contentType: "application/pdf" });
    if (error) throw error;
    psqlAsUserRow(F01_DESIGNER_ID, `SELECT to_jsonb(public.file_plan_prints('${JOB}', '${prefix}-file', '${JSON.stringify([
      {
        kind: "new_sheet",
        sheet: { number: `E8A-${info.project.name[0]}-${stamp}`, title: "E8 a11y private folio file" },
        print: {
          storage_path: `${prefix}.pdf`,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          size_bytes: bytes.length,
        },
      },
    ])}'::jsonb))::text;`);
  });

  test.afterAll(() => {
    const project = test.info().project.name;
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `rc7-e8-a11y-${project}.json`);
    let prior: { axeResults: AxeSummary[]; tabCounts: Record<string, number> } =
      { axeResults: [], tabCounts: {} };
    try {
      prior = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* first worker */
    }
    const surfaces = new Set(axeResults.map((r) => r.surface));
    writeFileSync(
      file,
      JSON.stringify(
        {
          axeResults: [
            ...prior.axeResults.filter((r) => !surfaces.has(r.surface)),
            ...axeResults,
          ],
          tabCounts: { ...prior.tabCounts, ...tabCounts },
          stopsChecked: {
            ...(prior as { stopsChecked?: Record<string, number> })
              .stopsChecked,
            ...stopsChecked,
          },
          borderIndicators: {
            ...(prior as { borderIndicators?: Record<string, number> })
              .borderIndicators,
            ...borderIndicators,
          },
          knownNoIndicator: {
            ...(prior as { knownNoIndicator?: Record<string, string> })
              .knownNoIndicator,
            ...knownNoIndicator,
          },
          focusIndicators: {
            ...(prior as { focusIndicators?: Record<string, string> })
              .focusIndicators,
            ...focusIndicators,
          },
        },
        null,
        2,
      ),
    );
    console.log(
      "[rc7-e8 axe]",
      project,
      JSON.stringify(
        axeResults.map((r) => ({
          s: r.surface,
          c: r.counts,
          ids: r.violations.map((v) => `${v.id}:${v.impact}:${v.nodes}`),
        })),
      ),
    );
    console.log("[rc7-e8 tabs]", project, JSON.stringify(tabCounts));
    console.log(
      "[rc7-e8 focus indicators]",
      project,
      JSON.stringify(focusIndicators),
    );
  });

  test("studio → job → FF&E unfold → save → close → studio, keyboard only", async ({
    authenticatedPage: page,
  }, info) => {
    const line = psqlScalar(
      `SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${LIVING}' AND name='${LINE_NAME}';`,
    );
    expect(line).toMatch(/^[0-9a-f-]{36}$/);
    const value = `RC7-E8 keyboard ${info.project.name} ${Date.now()}`;
    // Compile /doc first so the keyboard arrival is not an HMR reload.
    await page.goto(`/doc/${JOB}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    await page.goto("about:blank");
    await page.goto("/desk", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedStudio(page);
    await axe(page, "studio");

    // Studio → job paper.
    await tabTo(
      page,
      page.getByRole("link", {
        name: /^Open the job paper — F01 Fictional Full-Service House/,
      }),
      "studio → Open the job paper",
    );
    await page.keyboard.press("Enter");
    await page.waitForURL(new RegExp(`/doc/${JOB}`), { timeout: 60_000 });
    await arrivedJob(page);
    await axe(page, "job paper (F01)");

    // Job → FF&E chapter: the Living Room disclosure, then its door.
    const room = page.locator(
      `[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`,
    );
    // First match: once open, the room's line buttons also carry the room name.
    const toggle = room.getByRole("button", { name: /Living Room/ }).first();
    await tabTo(page, toggle, "job → Living Room disclosure");
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const door = room.getByRole("link", { name: /Edit room selections/ });
    await tabTo(page, door, "Living Room → Edit room selections");
    await page.keyboard.press("Enter");
    await expect(instrument(page)).toBeVisible({ timeout: 30_000 });
    await expect(
      instrument(page).locator(`[data-room-heading="${LIVING}"]`),
    ).toBeFocused({ timeout: 30_000 });

    // Unfold → Specifications lens → the line → Finish → Enter saves.
    await tabTo(
      page,
      instrument(page)
        .getByRole("group", { name: "Schedule view" })
        .getByRole("button", { name: "Specifications" }),
      "unfold → Specifications lens (Shift+Tab: the lens bar precedes the focused room heading)",
      true,
    );
    await page.keyboard.press("Enter");
    await expect(instrument(page).getByTestId("spec-lens")).toBeVisible({
      timeout: 30_000,
    });
    const lineButton = instrument(page)
      .getByTestId("spec-lens")
      .locator(`[data-line-id="${line}"] > button`);
    await tabTo(page, lineButton, "Specifications → line");
    await page.keyboard.press("Enter");
    await expect(lineButton).toHaveAttribute("aria-current", "true", {
      timeout: 30_000,
    });
    const pane = instrument(page).getByTestId("spec-fields-pane");
    await expect(pane).toContainText(LINE_NAME, { timeout: 30_000 });
    await axe(page, "FF&E unfold, Specifications, line open");
    const finish = pane.getByRole("textbox", { name: "Finish", exact: true });
    await tabTo(page, finish, "line → Finish field");
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await page.keyboard.type(value);
    await page.keyboard.press("Enter");
    await expect
      .poll(
        () =>
          psqlScalar(
            `SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id='${line}';`,
          ),
        { timeout: 30_000, message: "keyboard save persisted (DB readback)" },
      )
      .toBe(value);
    await expect(finish).not.toHaveAttribute("aria-invalid", "true");

    // Close. Esc in a non-empty field is held by design (escapeIsHeld,
    // build-room-shell.tsx:190), so she leaves the field first: Shift+Tab to the
    // line she chose, then Esc folds the unfold.
    await page.keyboard.press("Escape");
    await expect(
      instrument(page),
      "Esc inside the filled Finish field keeps the unfold open",
    ).toBeVisible();
    await tabTo(
      page,
      lineButton,
      "Finish → back to the line (Shift+Tab)",
      true,
    );
    await page.keyboard.press("Escape");
    await expect(instrument(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(
      door,
      "focus returns to the door that opened the unfold",
    ).toBeFocused({ timeout: 10_000 });

    // Back to the studio through the job head's Studio link.
    const studioLink = page
      .locator("[data-document-shell]")
      .getByRole("link", { name: /Studio/ })
      .first();
    await tabTo(page, studioLink, "door → job head Studio link", true);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/desk/, { timeout: 60_000 });
    await arrivedStudio(page);
    // The saved value is still the database value after the round trip.
    expect(
      psqlScalar(
        `SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id='${line}';`,
      ),
    ).toBe(value);
  });

  test("acceptance chapter (C4/C6 active): keyboard resolve-condition form, refused submit, cancel", async ({
    page,
  }) => {
    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    expect(job, "E7 mixed fixture loaded").toMatch(/^[0-9a-f-]{36}$/);
    const openConditions = () =>
      psqlScalar(`SELECT count(*) FROM public.service_acceptance_condition_resolutions c
      JOIN public.service_acceptance_requests r ON r.id = c.request_id WHERE r.project_id='${job}';`);
    const before = openConditions();
    await signInAs(page, E7_OWNER);
    await page.goto("about:blank");
    await page.goto(`/doc/${job}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    await expect(
      closeout.locator("[data-service-acceptance-request]").first(),
    ).toBeAttached({ timeout: 30_000 });
    await axe(page, "job paper (E7, acceptance active)");
    await axe(
      page,
      "acceptance/care chapter (E7)",
      '[data-paper-chapter="closeout"]',
    );

    const resolveButton = closeout.getByRole("button", {
      name: "Resolve this condition",
    });
    await tabTo(page, resolveButton, "job → Resolve this condition");
    await page.keyboard.press("Enter");
    const form = closeout.getByRole("form", { name: /^Resolve: / });
    await expect(form).toBeVisible();
    const how = form.getByLabel("How it was resolved");
    await tabTo(page, how, "form → How it was resolved");
    await page.keyboard.type("Oak floor kept; recorded by keyboard");
    await axe(
      page,
      "resolve-condition form open",
      '[data-paper-chapter="closeout"]',
    );
    // Refused branch: no reference chosen → inline alert, no mutation.
    await tabTo(
      page,
      form.getByRole("button", { name: "Record the resolution" }),
      "form → Record the resolution",
    );
    await page.keyboard.press("Enter");
    await expect(form.getByRole("alert")).toContainText("choose one reference");
    expect(
      openConditions(),
      "refused submit records no resolution (condition stays open)",
    ).toBe(before);
    // Cancel after the refusal closes the form and returns focus to its opener.
    await tabTo(
      page,
      form.getByRole("button", { name: "Cancel" }),
      "form → Cancel",
    );
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    await expect(
      resolveButton,
      "Cancel after a refused submit returns focus to the opener",
    ).toBeFocused();
  });

  // RC7-E8-1 (fixed by FIX4 5386a159e): Cancel on the resolve-condition form used to
  // drop keyboard focus to <body>; it now returns focus to its opener.
  test('RC7-E8-1: Cancel returns focus to "Resolve this condition"', async ({
    page,
  }) => {
    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    await signInAs(page, E7_OWNER);
    // As the acceptance test above: the studio settles before the job opens
    // (on WebKit a navigation cut into the studio's first reads left the job
    // read failed, "This document could not be loaded" — observation O-4).
    await arrivedStudio(page);
    await page.goto("about:blank");
    await page.goto(`/doc/${job}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    const resolveButton = closeout.getByRole("button", {
      name: "Resolve this condition",
    });
    await tabTo(page, resolveButton, "E8-1 → Resolve this condition");
    await page.keyboard.press("Enter");
    const form = closeout.getByRole("form", { name: /^Resolve: / });
    await tabTo(
      page,
      form.getByRole("button", { name: "Cancel" }),
      "E8-1 → Cancel",
    );
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    await expect(resolveButton).toBeFocused();
  });
  // DEFECT RC7-E8-6: the schedule's ghost "Name a phase" input
  // (schedule/ghost-add-line.tsx:226) sets focus:outline-none and paints no
  // replacement, so a keyboard reader passing it sees no focus (2.4.7 AA).
  // Kept out of the gate through KNOWN_NO_INDICATOR.
  test.fixme('RC7-E8-6: "Name a phase" shows a focus indicator', async ({
    page,
  }) => {
    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    await signInAs(page, E7_OWNER);
    await arrivedStudio(page);
    await page.goto("about:blank");
    await page.goto(`/doc/${job}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    await tabTo(
      page,
      page.getByRole("textbox", { name: "Name a phase" }).first(),
      "E8-6 → Name a phase",
      false,
      250,
      true,
    );
  });
  test("RC7-E8-2: axe color-contrast serious == 0 on every surface", async ({
    page,
  }) => {
    const incomplete: Record<string, number> = {};
    const contrast = async (surface: string, include?: string) => {
      const shell = page.locator('[data-paper-renderer="round8"][data-document-shell]');
      if (await shell.count()) {
        await expect(page.locator('[data-document-paper] > [data-paper-shown]').first()).toBeAttached({ timeout: 30_000 });
        await expect(shell).toHaveAttribute('data-lens-resolved', 'true', { timeout: 30_000 });
      }
      const { violations } = await runAxe(
        page,
        `${surface} [RC7-E8-2]`,
        include,
      );
      await settleAnimations(page, `${surface} [RC7-E8-2 incomplete]`);
      incomplete[surface] = await page.evaluate(async (context) => {
        const run = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<any> } }).axe.run;
        const result = await run(context ? { include: [context] } : document, {
          runOnly: { type: 'rule', values: ['color-contrast'] },
          resultTypes: ['incomplete'],
        });
        return result.incomplete.find((entry: { id: string }) => entry.id === 'color-contrast')?.nodes.length ?? 0;
      }, include ?? null);
      return violations.filter((v) => v.id === "color-contrast");
    };
    const found: Record<string, unknown> = {};
    const line = psqlScalar(
      `SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${LIVING}' AND name='${LINE_NAME}';`,
    );
    await signInAs(page, F01_DESIGNER);
    await arrivedStudio(page);
    found.studio = await contrast("studio");
    await page.goto(`/doc/${JOB}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    const folio = page.getByRole("button", { name: /The folio · \d+ files? ↓/ });
    await tabTo(page, folio, "contrast job → private folio disclosure");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "studio", exact: true }).first()).toBeVisible();
    found.f01 = await contrast("job paper (F01)");
    const room = page.locator(
      `[data-paper-chapter="ffe"] [data-pieces-room="${LIVING}"]`,
    );
    const toggle = room.getByRole("button", { name: /Living Room/ }).first();
    await tabTo(page, toggle, "contrast job → Living Room disclosure");
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await page.keyboard.press("Enter");
    const door = room.getByRole("link", { name: /Edit room selections/ });
    await tabTo(page, door, "contrast Living Room → Edit room selections");
    await page.keyboard.press("Enter");
    await expect(
      instrument(page).locator(`[data-room-heading="${LIVING}"]`),
    ).toBeFocused({ timeout: 30_000 });
    await tabTo(
      page,
      instrument(page)
        .getByRole("group", { name: "Schedule view" })
        .getByRole("button", { name: "Specifications" }),
      "contrast unfold → Specifications",
      true,
    );
    await page.keyboard.press("Enter");
    const lineButton = instrument(page)
      .getByTestId("spec-lens")
      .locator(`[data-line-id="${line}"] > button`);
    await tabTo(page, lineButton, "contrast Specifications → line");
    await page.keyboard.press("Enter");
    await expect(lineButton).toHaveAttribute("aria-current", "true", {
      timeout: 30_000,
    });
    await expect(instrument(page).getByTestId("spec-fields-pane")).toContainText(
      LINE_NAME,
      { timeout: 60_000 },
    );
    await expect(page.getByText('Authorizations & trade scopes', { exact: false }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^Working budget ·/ }).first()).toBeVisible();
    await expect(page.getByText(/^Start with ·/).first()).toBeVisible();
    await expect(page.getByText(/^(Studio only|Studio eyes only)$/).first()).toBeVisible();
    found.spec = await contrast("FF&E unfold, Specifications, line open");

    const job = psqlScalar(
      `SELECT id FROM public.projects WHERE name='E7 household job' AND designer_id='e7e70000-0000-4000-8000-000000000001';`,
    );
    await page.goto("about:blank");
    await page.context().clearCookies();
    await signInAs(page, E7_OWNER);
    await page.goto("about:blank");
    await page.goto(`/doc/${job}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await arrivedJob(page);
    const closeout = page.locator('[data-paper-chapter="closeout"]');
    await expect(
      closeout.locator("[data-service-acceptance-request]").first(),
    ).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('[data-paper-chapter="schedule"] span').filter({ hasText: /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/ }).first()).toBeVisible();
    found.e7 = await contrast("job paper (E7, acceptance active)");
    found.e7Closeout = await contrast(
      "acceptance/care chapter (E7)",
      '[data-paper-chapter="closeout"]',
    );
    const resolveButton = closeout.getByRole("button", {
      name: "Resolve this condition",
    });
    await tabTo(page, resolveButton, "contrast job → Resolve this condition");
    await page.keyboard.press("Enter");
    await expect(
      closeout.getByRole("form", { name: /^Resolve: / }),
    ).toBeVisible();
    found.resolveForm = await contrast(
      "resolve-condition form open",
      '[data-paper-chapter="closeout"]',
    );
    console.log('[rc7-e8 contrast-incomplete]', test.info().project.name, JSON.stringify(incomplete));
    expect(
      Object.values(found).flat(),
      `color-contrast serious ${JSON.stringify(found)}`,
    ).toEqual([]);
  });
});
