/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildBoardModel, renderBoardPdf } from "../_shared/spec-pdf.ts";
import { preparePdfStudioLogo } from "./pdf-logo.ts";

const HOSTILE_SVG_SOURCE =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse" />
  <text x="50" y="65" text-anchor="middle" font-family="'Times New Roman', Times, Georgia, serif">P</text>
</svg>`;

Deno.test("preparePdfStudioLogo leaves an absent logo absent", async () => {
  let calls = 0;
  const prepared = await preparePdfStudioLogo(undefined, () => {
    calls += 1;
    return Promise.resolve("unreachable");
  });
  assertEquals(prepared, undefined);
  assertEquals(calls, 0);
});

Deno.test("preparePdfStudioLogo returns SSRF-loader PNG/JPEG data", async () => {
  const expected = "data:image/png;base64,cG5n";
  const prepared = await preparePdfStudioLogo(
    "https://cdn.patina.cloud/studio/logo.png",
    () => Promise.resolve(expected),
  );
  assertEquals(prepared, expected);
});

Deno.test("unsupported SVG logo is omitted and the board PDF still renders", async () => {
  const prepared = await preparePdfStudioLogo(
    "https://cdn.patina.cloud/studio/logo.svg?v=1",
    () => Promise.reject(new Error("unsupported_image_type")),
  );
  assertEquals(prepared, undefined);

  // The fixture retains the exact class of SVG that caused production to fail.
  // It must never be handed to react-pdf after the guarded loader rejects it.
  assert(
    HOSTILE_SVG_SOURCE.includes("'Times New Roman', Times, Georgia, serif"),
  );
  const model = buildBoardModel(
    {
      studioName: "Middle Studio",
      projectName: "QA proposal",
      boardName: "SVG logo regression",
      sections: [],
      tiles: [],
    },
    {},
  );
  const bytes = await renderBoardPdf(model, {
    studioName: "Middle Studio",
    projectName: "QA proposal",
    studioLogoUrl: prepared,
  });
  assert(bytes.length > 1_000);
});
