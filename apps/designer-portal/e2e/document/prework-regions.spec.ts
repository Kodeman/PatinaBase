/**
 * The pre-work spreads under test (R127 Wave 5, W5-L2/W5-R2), read on `…d6`
 * — a sent, unopened proposal with no project behind it, the seed's only
 * fixed-id pre-work paper (`seed-notes.md`: "$9,400 fee", `sent_at` = now()
 * − 6 days, no scope rooms, no description). Its own spread is `proposal`,
 * whose OD-2 order (re-parented by region under W5-R2 item 1) is
 * `proposal → scope → vision → investment → record`.
 *
 * THE FALSIFIABLE SENTENCES:
 *   · the region list mounts in that exact order, one `[data-region-head]`
 *     each (OD-2);
 *   · a stop with nothing of its own prints its EXACT empty-row sentence —
 *     `Nothing yet` / `Not written yet` / `Not sent yet` — never a dash or a
 *     placeholder figure (OD-1). On `…d6`: `vision` (no description) and
 *     `scope` (no rooms, payments, phases or exclusions) are empty;
 *     `proposal` and `investment` carry real facts;
 *   · the ladder's own value slot for an empty stop reads its literal
 *     `NOTHING YET` fallback — the rail's uppercase register, distinct from
 *     the paper's sentence-case status line (`lens-ladder-derivation.ts`'s
 *     `empty()` default, restated here because e2e cannot import it);
 *   · line 1's identity carries the client and the spread's name with no
 *     ordinal — a pre-work paper has no phase, so `N OF 6` never prints
 *     here the way it does on a project spread (W5-R2 item 3), and the
 *     rail head's own stage phrase agrees;
 *   · the proposal stop's own value reads `SENT <date> · UNOPENED <n>D`.
 *
 * BROWSERS (test-impact, "Browser ruling"): chromium + webkit. Firefox is
 * skipped with its reason, the repo's own idiom.
 */
import { test, expect, type AuthenticatedPage } from "../fixtures/auth";
import { scrollTo, settle } from "../helpers/lens";
import { PRE_WORK_ID } from "./lens-fixtures";

test.describe.configure({ mode: "serial" });
test.skip(
  ({ browserName }) => browserName === "firefox",
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

/** OD-2's mount order for the proposal spread, re-parented under W5-R2
 *  item 1: `scope`/`vision` take the blocks that used to stand entirely
 *  under `investment`. */
const PROPOSAL_SPREAD_ORDER = [
  "proposal",
  "scope",
  "vision",
  "investment",
  "record",
];

/** The three exact empty-row sentences OD-1 allows — a fact prints, or one
 *  of these does, sentence case, never a dash and never a placeholder
 *  figure ("$0", "—", "N/A"). */
const EMPTY_ROW_SENTENCES = ["Nothing yet", "Not written yet", "Not sent yet"];

async function openPaper(page: AuthenticatedPage): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${PRE_WORK_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-document-shell]")).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

/** The head's own status line — the first `<p>` immediately after its
 *  `<h2>` (`region-head.tsx`). Selecting `h2 + p` rather than `p:first-of-
 *  type` matters on the `proposal` stop specifically: it carries an eyebrow
 *  `<p>` (the proposal's version) BEFORE the `<h2>`, so "first p" would read
 *  the eyebrow instead of the status. */
function statusOf(page: AuthenticatedPage, key: string) {
  return page
    .locator(
      `[data-document-paper] [data-index-region="${key}"] [data-region-head] h2 + p`,
    )
    .first();
}

test.describe("the pre-work spreads under test (…d6, W5-R2)", () => {
  test("mounts its regions in OD-2 order, each with a head", async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    const keys = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("[data-document-paper] [data-index-region]"),
      ).map((el) => el.getAttribute("data-index-region")),
    );
    expect(keys).toEqual(PROPOSAL_SPREAD_ORDER);

    for (const key of PROPOSAL_SPREAD_ORDER) {
      await expect(
        page.locator(
          `[data-document-paper] [data-index-region="${key}"] [data-region-head]`,
        ),
        `"${key}" has no [data-region-head]`,
      ).toHaveCount(1);
    }
  });

  test('vision prints its name over "Not written yet" — no description on this document', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    const status = (await statusOf(page, "vision").textContent())?.trim();
    expect(status).toBe("Not written yet");
  });

  test('scope prints "Nothing yet" — no rooms, payments, phases or exclusions on this document', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    const status = (await statusOf(page, "scope").textContent())?.trim();
    expect(status).toBe("Nothing yet");
  });

  test('the proposal stop prints "Sent <date> · unopened <n>d"', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    const status =
      (await statusOf(page, "proposal").textContent())?.trim() ?? "";
    expect(status).toMatch(/^Sent [A-Za-z]{3} \d{1,2} · unopened \d+d$/i);
  });

  test('the investment stop prints a dollar figure, never "Nothing yet" — this proposal carries a fee', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    const status =
      (await statusOf(page, "investment").textContent())?.trim() ?? "";
    expect(status).toMatch(/^\$[\d,]+$/);
  });

  test('every stop prints an exact fact or an exact empty-row sentence — never a dash, "—", or a $0 husk', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    for (const key of PROPOSAL_SPREAD_ORDER) {
      const status = (await statusOf(page, key).textContent())?.trim() ?? "";
      expect(
        status.length,
        `"${key}" printed an empty status line`,
      ).toBeGreaterThan(0);
      expect(status, `"${key}" printed "${status}"`).not.toMatch(/—|--|\$0\b/);
      const isKnownFact = /^sent |^\$|complete$/i.test(status);
      if (!isKnownFact) {
        expect(
          EMPTY_ROW_SENTENCES,
          `"${key}" printed "${status}", not one of the three ruled sentences`,
        ).toContain(status);
      }
    }
  });

  test("the ladder prints the literal NOTHING YET fallback for a stop with no number", async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await expect(page.locator('[data-ladder-segment="vision"]')).toContainText(
      "NOTHING YET",
    );
    await expect(page.locator('[data-ladder-segment="scope"]')).toContainText(
      "NOTHING YET",
    );
  });

  test("line 1 carries the client and the spread name with no ordinal (W5-R2 item 3)", async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    // At s0 the letterhead already prints the identity and the band yields
    // it (line1.identity prints null there) — scroll past it first, the same
    // offset `lens-band-height.spec.ts`'s eighteen cells already exercise.
    await scrollTo(page, 400);

    const identity =
      (await page.locator("[data-lens-identity]").textContent())?.trim() ?? "";
    expect(
      identity.length,
      "the band identity printed nothing at scrollY 400",
    ).toBeGreaterThan(0);
    // A pre-work paper has no phase (W5-R2 item 3): `<CLIENT> · PROPOSAL`,
    // never `<CLIENT> · PROPOSAL 4 OF 6`.
    expect(identity).toMatch(/· PROPOSAL$/);
    expect(identity, `identity carried an ordinal: "${identity}"`).not.toMatch(
      /\d+\s*OF\s*\d+/i,
    );

    // The rail head's own stage phrase — the same fact, the same width
    // (W5-R2 item 3: "the two agree").
    const railStage =
      (await page.locator("[data-spine-stage-phrase]").textContent())?.trim() ??
      "";
    expect(
      railStage,
      `rail stage phrase carried an ordinal: "${railStage}"`,
    ).not.toMatch(/\d+\s*OF\s*\d+/i);
  });
});
