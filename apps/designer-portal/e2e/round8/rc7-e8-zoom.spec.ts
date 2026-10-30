import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth";
import { adminDb } from "../helpers/supabase-admin";
import { psqlAsUserRow, psqlRun, psqlScalar } from "../helpers/psql";
import { rc7OwnedStackSql } from "./owned-stack";

/**
 * RC-7 E8 — X06 at 200% browser zoom. Zoom is emulated the way the existing
 * zoom-accessibility probes do it: the CSS viewport is halved and the device
 * scale factor doubled, which is what a 200% page zoom does to layout (CSS px
 * per physical px) in Chromium. "1280 at 200%" = 640×360 CSS at DSF 2; "390 at
 * 200%" = 195×422 CSS at DSF 2. Not CSS `zoom`.
 *
 * For each surface the probe lists every rendered focusable control under the
 * surface root, then walks the root in native tab order (Alt+Tab on WebKit)
 * and judges each control the keyboard reaches by what it shows WHILE
 * focused: it must be rendered, inside the viewport horizontally, on screen
 * vertically, and ≥ 98% visible inside every overflow:hidden/clip ancestor
 * that clips it. A control the walk never reaches is judged by its static
 * geometry. A fully clipped control is a clipped control (never presumed
 * intentional); an intentional exclusion must be named in INTENTIONALLY_HIDDEN.
 * Horizontal scroll containers are keyboard-reachable only if the walk
 * focused the container itself, or reached its focusable content and every
 * reached descendant was fully visible inside it on focus.
 *
 * Asserted at 1280@200%: 0 clipped controls, every horizontal scroll container
 * keyboard-reachable, no sideways page scroll. 390@200% (195 CSS px, below the
 * 1.4.10 floor) is recorded; its 0-clipped assertion is the RC7-E8-3 fixme.
 */

const JOB = "f0180000-0000-4000-8000-000000000010";
const LIVING = "f0180000-0000-4000-8000-000000000011";
const DESIGNER = "f0180000-0000-4000-8000-000000000002";
const OUT =
  process.env.PLAYWRIGHT_OUTPUT_DIR ??
  path.join(__dirname, "../../test-results/round8");
const SHOTS = path.resolve(
  __dirname,
  "../../../../docs/design/designer-portal-round8/evidence/rc/visual-rc7",
);
const ZOOMS = [
  { label: "1280@200", viewport: { width: 640, height: 360 } },
  { label: "390@200", viewport: { width: 195, height: 422 } },
];
/**
 * Controls deliberately hidden from sight and keyboard, each with its reason.
 * Empty: no exclusion has been justified. Entries are `el.matches` selectors.
 */
const INTENTIONALLY_HIDDEN: ReadonlyArray<{
  name: string;
  selector: string;
  why: string;
}> = [];
const rpc = (sql: string) =>
  JSON.parse(psqlAsUserRow(DESIGNER, `SELECT to_jsonb(${sql})::text;`)[0]);
const results: Record<string, unknown> = {};

type Clip = { selector: string; name: string; reason: string };
type Probe = {
  pageOverflowPx: number;
  controls: number;
  tabReached: number;
  walkEnded: string;
  clipped: Clip[];
  excluded: Array<Clip & { allowlist: string }>;
  scrollContainers: Array<{
    selector: string;
    scrollWidth: number;
    clientWidth: number;
    keyboardReachable: boolean;
    reachedDescendants: number;
  }>;
  chromeShare: number;
};

/** Installs window.__e8z: the static control census and the per-element visibility judge. */
function install(args: {
  selector: string;
  allowlist: ReadonlyArray<{ name: string; selector: string }>;
}) {
  const describe = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${CSS.escape(el.id)}` : "";
    const data = [...el.attributes]
      .filter((a) => a.name.startsWith("data-") && a.value.length < 40)
      .slice(0, 2)
      .map((a) => `[${a.name}${a.value ? `="${a.value}"` : ""}]`)
      .join("");
    const label = el.getAttribute("aria-label");
    return `${tag}${id}${data}${label ? `[aria-label="${label.slice(0, 40)}"]` : ""}`;
  };
  const name = (el: Element) =>
    (el.getAttribute("aria-label") ?? el.textContent ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 50);
  const rendered = (el: Element) =>
    typeof (el as HTMLElement).checkVisibility === "function"
      ? (el as HTMLElement).checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      : true;
  // Does `a` establish the containing block for a fixed-position descendant?
  const fixedContainer = (cs: CSSStyleDeclaration) =>
    cs.transform !== "none" ||
    cs.filter !== "none" ||
    cs.perspective !== "none" ||
    /paint|layout|strict|content/.test(cs.contain) ||
    /transform|filter|perspective/.test(cs.willChange);
  /** null = fully visible; otherwise why it is not. */
  const judge = (el: Element, focused: boolean): string | null => {
    if (!rendered(el)) return "not rendered visible";
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1)
      return `no box (${Math.round(r.width)}×${Math.round(r.height)})`;
    const vw = document.documentElement.clientWidth;
    if (r.left < -1 || r.right > vw + 1)
      return `outside viewport x ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`;
    if (focused && (r.bottom <= 0 || r.top >= innerHeight))
      return `outside viewport y ${Math.round(r.top)}..${Math.round(r.bottom)} of ${innerHeight}`;
    // Only ancestors that contain the control's box clip it: a fixed or
    // absolute control escapes overflow ancestors that are not its containing block.
    let mode = getComputedStyle(el).position;
    for (
      let a = el.parentElement;
      a && a !== document.body && a !== document.documentElement;
      a = a.parentElement
    ) {
      const cs = getComputedStyle(a);
      const contains =
        mode === "fixed"
          ? fixedContainer(cs)
          : mode === "absolute"
            ? cs.position !== "static" || fixedContainer(cs)
            : true;
      if (!contains) continue;
      if (
        /(hidden|clip)/.test(cs.overflowX) ||
        /(hidden|clip)/.test(cs.overflowY)
      ) {
        const ar = a.getBoundingClientRect();
        const w = Math.max(
          0,
          Math.min(r.right, ar.right) - Math.max(r.left, ar.left),
        );
        const h = Math.max(
          0,
          Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top),
        );
        const share = (w * h) / (r.width * r.height);
        if (share < 0.98)
          return `${Math.round(share * 100)}% visible inside ${describe(a)}`;
      }
      mode = cs.position;
    }
    return null;
  };
  const root = document.querySelector(args.selector) ?? document.body;
  const controls = [
    ...root.querySelectorAll(
      'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.closest("[inert]"))
      return false;
    const r = el.getBoundingClientRect();
    return rendered(el) && r.width > 1 && r.height > 1;
  });
  const allow = (el: Element) =>
    args.allowlist.find((entry) => el.matches(entry.selector))?.name ?? null;
  (window as unknown as { __e8z: unknown }).__e8z = {
    root,
    controls,
    statics: controls.map((el) => judge(el, false)),
    reached: new Map<Element, string | null>(),
    judge,
    describe,
    name,
    allow,
  };
  return controls.length;
}

type E8z = {
  root: Element;
  controls: Element[];
  statics: Array<string | null>;
  reached: Map<Element, string | null>;
  judge: (el: Element, focused: boolean) => string | null;
  describe: (el: Element) => string;
  name: (el: Element) => string;
  allow: (el: Element) => string | null;
};

async function probe(page: Page, rootSelector: string): Promise<Probe> {
  const count = await page.evaluate(install, {
    selector: rootSelector,
    allowlist: INTENTIONALLY_HIDDEN,
  });
  // Native tab order from the root's start: focus the root (tabindex -1 only
  // for the walk), then Tab until focus leaves the root, ends, or cycles.
  await page.evaluate(() => {
    const { root } = (window as unknown as { __e8z: E8z }).__e8z;
    if (!root.hasAttribute("tabindex")) {
      root.setAttribute("tabindex", "-1");
      root.setAttribute("data-e8-walk-tabindex", "");
    }
    (root as HTMLElement).focus({ preventScroll: true });
  });
  const key =
    page.context().browser()?.browserType().name() === "webkit"
      ? "Alt+Tab"
      : "Tab";
  let walkEnded = "limit";
  for (let step = 0; step < Math.max(60, count * 3); step++) {
    await page.keyboard.press(key);
    if (step === 0)
      await page.evaluate(() => {
        const { root } = (window as unknown as { __e8z: E8z }).__e8z;
        if (root.hasAttribute("data-e8-walk-tabindex")) {
          root.removeAttribute("tabindex");
          root.removeAttribute("data-e8-walk-tabindex");
        }
      });
    // Human pace: the lens opens a quiet stop once the focus scroll settles (L-9).
    await page.waitForTimeout(150);
    let state = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      state = await page.evaluate((final) => {
        const z = (window as unknown as { __e8z: E8z }).__e8z;
        const el = document.activeElement;
        if (!el || el === document.body) return "end";
        if (!z.root.contains(el) || el === z.root) return "left root";
        if (z.reached.has(el)) return "cycle";
        const verdict = z.judge(el, true);
        if (verdict !== null && !final) return "retry";
        z.reached.set(el, verdict);
        return "ok";
      }, attempt === 3);
      if (state !== "retry") break;
      // A focus scroll may still be moving: re-judge before recording a clip.
      await page.waitForTimeout(300);
    }
    if (state === "end" || state === "left root" || state === "cycle") {
      walkEnded = state;
      break;
    }
  }
  return page
    .evaluate(() => {
      const z = (window as unknown as { __e8z: E8z }).__e8z;
      const vw = document.documentElement.clientWidth;
      const clipped: Clip[] = [];
      const excluded: Array<Clip & { allowlist: string }> = [];
      const verdicts = new Map<Element, string | null>();
      z.controls.forEach((el, i) =>
        verdicts.set(
          el,
          z.reached.has(el)
            ? z.reached.get(el)!
            : z.statics[i] && `${z.statics[i]} (never reached by Tab)`,
        ),
      );
      for (const [el, verdict] of z.reached)
        if (!verdicts.has(el)) verdicts.set(el, verdict);
      for (const [el, reason] of verdicts) {
        if (reason === null) continue;
        const entry = { selector: z.describe(el), name: z.name(el), reason };
        const allowlist = z.allow(el);
        if (allowlist) excluded.push({ ...entry, allowlist });
        else clipped.push(entry);
      }
      const scrollContainers = [...z.root.querySelectorAll("*")]
        .filter(
          (el) =>
            /(auto|scroll)/.test(getComputedStyle(el).overflowX) &&
            el.scrollWidth > el.clientWidth + 1,
        )
        .map((el) => {
          const reached = [...z.reached].filter(
            ([node]) => node !== el && el.contains(node),
          );
          const box = el.getBoundingClientRect();
          return {
            selector: z.describe(el),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            reachedDescendants: reached.length,
            keyboardReachable:
              z.reached.has(el) ||
              (reached.length > 0 &&
                reached.every(([, verdict]) => verdict === null)),
            // `box` keeps the container's own geometry in the evidence.
            box: [Math.round(box.left), Math.round(box.right)],
          };
        });
      let chrome = 0;
      for (const el of document.querySelectorAll("body *")) {
        const position = getComputedStyle(el).position;
        if (position !== "fixed" && position !== "sticky") continue;
        if (
          el.parentElement &&
          ["fixed", "sticky"].includes(
            getComputedStyle(el.parentElement).position,
          )
        )
          continue;
        const r = el.getBoundingClientRect();
        if (r.width < innerWidth * 0.5) continue;
        const top = Math.max(0, r.top),
          bottom = Math.min(innerHeight, r.bottom);
        if (bottom > top) chrome += bottom - top;
      }
      return {
        pageOverflowPx:
          Math.max(
            document.body.scrollWidth,
            document.documentElement.scrollWidth,
          ) - vw,
        controls: z.controls.length,
        tabReached: z.reached.size,
        walkEnded: "",
        clipped,
        excluded,
        scrollContainers,
        chromeShare:
          Math.round((Math.min(chrome, innerHeight) / innerHeight) * 100) / 100,
      };
    })
    .then((result) => ({ ...result, walkEnded }));
}

async function settleJob(page: Page, search = "") {
  await page.goto("about:blank");
  await page.goto(`/doc/${JOB}${search}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await expect(
    page.locator('[data-document-shell][data-paper-renderer="round8"]'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator("[data-document-shell][data-arrival-ready]"),
  ).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator("html")).not.toHaveClass(
    /\barr-(?:pre|on|press)\b/,
    { timeout: 30_000 },
  );
}

async function record(
  page: Page,
  key: string,
  rootSelector: string,
  shotTarget?: string,
) {
  const project = test.info().project.name;
  mkdirSync(SHOTS, { recursive: true });
  const options = {
    path: path.join(
      SHOTS,
      `${project}-zoom-${key.replace("@", "at").replace(/[^a-z0-9]+/gi, "-")}.jpg`,
    ),
    type: "jpeg" as const,
    quality: 60,
    animations: "disabled" as const,
  };
  // Captured before the tab walk moves the page.
  if (shotTarget) await page.locator(shotTarget).first().screenshot(options);
  else await page.screenshot(options);
  const result = await probe(page, rootSelector);
  results[`${project} ${key}`] = result;
  console.log(
    "[rc7-e8 zoom]",
    project,
    key,
    JSON.stringify({
      overflow: result.pageOverflowPx,
      controls: result.controls,
      tabReached: result.tabReached,
      walk: result.walkEnded,
      clipped: result.clipped.length,
      excluded: result.excluded.length,
      scroll: result.scrollContainers.length,
      chrome: result.chromeShare,
    }),
  );
  return result;
}

let issueEntryText = "";

function expectReachable(key: string, result: Probe) {
  expect(result.clipped, `${key}: clipped controls`).toEqual([]);
  expect(
    result.scrollContainers.filter((c) => !c.keyboardReachable),
    `${key}: horizontal scroll containers the keyboard cannot reach`,
  ).toEqual([]);
}

type Surface = (page: Page, label: string) => Promise<Array<[string, Probe]>>;

const SURFACES: Record<string, Surface> = {
  "long content — the whole job paper": async (page, label) => {
    await settleJob(page);
    await page.evaluate(async () => {
      for (
        let y = 0;
        y < document.documentElement.scrollHeight;
        y += Math.max(150, innerHeight * 0.8)
      ) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      window.scrollTo(0, 0);
    });
    const key = `${label} job paper`;
    return [[key, await record(page, key, "[data-document-shell]")]];
  },

  "FF&E table (Specifications, a line open)": async (page, label) => {
    const line = psqlScalar(
      `SELECT id FROM public.project_ffe_items WHERE project_id='${JOB}' AND project_room_id='${LIVING}' ORDER BY name LIMIT 1;`,
    );
    await settleJob(
      page,
      `?unfold=pieces&lens=spec&room=${LIVING}&line=${line}`,
    );
    const sheet = page.locator(
      '[data-paper-chapter="ffe"] [data-unfold-instrument="pieces"]',
    );
    await expect(sheet.getByTestId("spec-lens")).toBeVisible({
      timeout: 60_000,
    });
    await expect(sheet.getByTestId("spec-fields-pane")).toBeVisible({
      timeout: 30_000,
    });
    await sheet.getByTestId("spec-fields-pane").scrollIntoViewIfNeeded();
    const specKey = `${label} ffe spec`;
    const spec = await record(
      page,
      specKey,
      '[data-unfold-instrument="pieces"]',
    );
    // The rough lens: the widest FF&E table (min-width 640px) on a wide
    // viewport; rough-in-table.tsx switches to its phone list when narrow.
    await settleJob(page, `?unfold=pieces&lens=rough&room=${LIVING}`);
    const roomSheet = sheet.getByRole("region", { name: "Living Room" });
    await expect(roomSheet).toBeVisible({ timeout: 60_000 });
    await roomSheet.scrollIntoViewIfNeeded();
    const form =
      (await roomSheet.locator("table").count()) > 0 ? "table" : "list";
    const roughKey = `${label} ffe rough ${form}`;
    return [
      [specKey, spec],
      [
        roughKey,
        await record(page, roughKey, '[data-unfold-instrument="pieces"]'),
      ],
    ];
  },

  "drawing/evidence viewer": async (page, label) => {
    await settleJob(page);
    const history = page.getByRole("region", { name: "Issued print history" });
    await history.scrollIntoViewIfNeeded();
    const entry = history
      .locator("details")
      .filter({ hasText: issueEntryText })
      .first();
    await entry.locator("summary").click();
    const opener = entry
      .getByRole("button", { name: "Open issued print" })
      .first();
    await opener.scrollIntoViewIfNeeded();
    const historyKey = `${label} drawing history`;
    const historyProbe = await record(
      page,
      historyKey,
      '[aria-label="Issued print history"]',
    );
    await opener.click();
    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible({ timeout: 30_000 });
    await expect(
      viewer.locator("iframe, object, embed, img").first(),
    ).toBeAttached({
      timeout: 30_000,
    });
    // Let the dialog's entrance finish before probing and capturing it.
    await expect
      .poll(() =>
        viewer.evaluate(
          (el) =>
            el
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === "running").length,
        ),
      )
      .toBe(0);
    await page.waitForTimeout(300);
    const viewerKey = `${label} viewer`;
    const viewerProbe = await record(page, viewerKey, '[role="dialog"]');
    await expect(
      viewer.getByRole("button", { name: "Back to the document", exact: true }),
    ).toBeVisible();
    return [
      [historyKey, historyProbe],
      [viewerKey, viewerProbe],
    ];
  },
};

test.describe("RC-7 E8 X06 200% zoom", () => {
  test.setTimeout(300_000);

  test.beforeAll(async ({}, info) => {
    // Refuse before the storage upload and the RPC writes unless
    // rc7_owned.stack names RC7_OWNED_STACK.
    psqlRun(rc7OwnedStackSql("rc7-e8 zoom print fixture"));
    // One filed, issued private print for the drawing/evidence viewer.
    const stamp = Date.now();
    const prefix = `${JOB}/plans/rc7-e8-${info.project.name}-${stamp}`;
    const bytes = readFileSync(
      path.resolve(__dirname, "../fixtures/whitlock-set.pdf"),
    );
    const { error } = await adminDb.storage
      .from("project-documents")
      .upload(`${prefix}.pdf`, bytes, { contentType: "application/pdf" });
    if (error) throw error;
    rpc(
      `public.file_plan_prints('${JOB}', '${prefix}-file', '${JSON.stringify([
        {
          kind: "new_sheet",
          sheet: {
            number: `E8-${info.project.name}-${stamp}`,
            title:
              "RC7-E8 zoom evidence plan with a deliberately long sheet title",
          },
          print: {
            storage_path: `${prefix}.pdf`,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            size_bytes: bytes.length,
          },
        },
      ])}'::jsonb)`,
    );
    issueEntryText = `E8 zoom ${info.project.name} ${stamp}`;
    rpc(
      `public.create_plan_issue('${JOB}', '${issueEntryText}', '${prefix}-issue')`,
    );
  });

  test.afterAll(() => {
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `rc7-e8-zoom-${test.info().project.name}.json`);
    let prior = {};
    try {
      prior = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* first worker */
    }
    writeFileSync(file, JSON.stringify({ ...prior, ...results }, null, 2));
  });

  for (const zoom of ZOOMS) {
    test.describe(`${zoom.label}`, () => {
      test.use({ viewport: zoom.viewport, deviceScaleFactor: 2 });
      const gated = zoom.label === "1280@200";

      for (const [title, surface] of Object.entries(SURFACES)) {
        test(`${zoom.label}: ${title}`, async ({ authenticatedPage: page }) => {
          const probes = await surface(page, zoom.label);
          expect(page.viewportSize()).toEqual(zoom.viewport);
          for (const [key, result] of probes) {
            expect(
              result.pageOverflowPx,
              `${key}: no sideways page scroll`,
            ).toBeLessThanOrEqual(1);
            // 390@200% (below the 1.4.10 floor) is recorded only; RC7-E8-3 below.
            if (gated) expectReachable(key, result);
          }
        });
      }

      // DEFECT RC7-E8-3: at 390@200% (195 CSS px) DocumentAction buttons keep
      // their shrink-0 intrinsic width in row layout and run past the right
      // edge, hidden by body overflow-x:hidden. Low severity (below the 320 px
      // floor). Kept out of the gate.
      if (!gated)
        test.fixme(`RC7-E8-3: ${zoom.label} has 0 clipped controls on every surface`, async ({
          authenticatedPage: page,
        }) => {
          for (const surface of Object.values(SURFACES))
            for (const [key, result] of await surface(
              page,
              `${zoom.label} RC7-E8-3`,
            ))
              expectReachable(key, result);
        });
    });
  }
});
