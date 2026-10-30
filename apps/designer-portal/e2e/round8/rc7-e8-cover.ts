import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { psqlRun, psqlScalar } from "../helpers/psql";
import { rc7OwnedStackSql } from "./owned-stack";

/**
 * RC-7 E8 lane-local helper: the studio's photographic cover (X04, X07).
 *
 * Global setup recreates F01 at the start of every run, so each spec that
 * measures or captures the studio applies the cover itself in its beforeAll
 * (never relying on another spec having run first). The owned-stack marker is
 * checked on its own before the storage upload, then again as the prefix of
 * the fixture write.
 */

export const COVER_JOB = "f0180000-0000-4000-8000-000000000010";
export const COVER_BOARD = "e8e80000-0000-4000-8000-000000000001";
const COVER_KEY = `${COVER_JOB}/boards/${COVER_BOARD}/room.png`;
const PHOTO = path.resolve(
  __dirname,
  "../../../../artifacts/room-proof-round8-2026-10-23/assets/room.png",
);

/** Uploads the reference photograph and points an active F01 board at it. Returns the DB readback. */
export async function applyCover(purpose: string): Promise<string> {
  // Refuse before any storage or DB write unless rc7_owned.stack names RC7_OWNED_STACK.
  psqlRun(rc7OwnedStackSql(`${purpose}: cover guard`));
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const upload = await fetch(
    `${api}/storage/v1/object/project-ffe-working/${COVER_KEY}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "image/png",
        "x-upsert": "true",
      },
      body: readFileSync(PHOTO),
    },
  );
  expect(upload.ok, `cover upload ${upload.status}`).toBe(true);
  psqlRun(
    rc7OwnedStackSql(`${purpose}: cover fixture`) +
      readFileSync(path.join(__dirname, "rc7-e8-cover-fixture.sql"), "utf8"),
  );
  const cover = psqlScalar(
    `SELECT cover_image_url FROM public.proposal_boards WHERE id='${COVER_BOARD}' AND status='active';`,
  );
  expect(cover, "cover board readback").toBe(COVER_KEY);
  return cover;
}

/** Asserts the studio's commission plate rendered the signed cover photograph; returns its facts. */
export async function expectCoverRendered(page: Page) {
  const plate = page.locator('[data-studio="round8"] img').first();
  await expect(
    plate,
    "the commission plate renders the board cover",
  ).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        plate.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      { timeout: 30_000, message: "the signed cover photograph decoded" },
    )
    .toBe(true);
  const facts = await plate.evaluate((img: HTMLImageElement) => ({
    signed: /\/storage\/v1\/object\/sign\/project-ffe-working\//.test(
      img.currentSrc,
    ),
    board: img.currentSrc.includes(
      "/boards/e8e80000-0000-4000-8000-000000000001/",
    ),
    natural: [img.naturalWidth, img.naturalHeight],
    box: [
      Math.round(img.getBoundingClientRect().width),
      Math.round(img.getBoundingClientRect().height),
    ],
    alt: img.alt,
  }));
  expect(facts, "the plate is the signed board cover").toMatchObject({
    signed: true,
    board: true,
  });
  return facts;
}
