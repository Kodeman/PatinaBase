// Deno test for the email asset-host rewrite.
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/_shared/email-assets.test.ts

import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSvgAssetUrl, toEmailAssetUrl } from "./email-assets.ts";

const CLOUD = "https://bkvcixdmuyejfzcijpdg.supabase.co";
const LOCAL = "http://127.0.0.1:54321";
const HOST = "https://api.patina.cloud";

Deno.test("a supabase public storage URL moves to the asset host", () => {
  assertEquals(
    toEmailAssetUrl(
      `${CLOUD}/storage/v1/object/public/studio-logos/middlewest/mark.png`,
      { supabaseUrl: CLOUD, assetHost: HOST },
    ),
    `${HOST}/storage/v1/object/public/studio-logos/middlewest/mark.png`,
  );
});

Deno.test("the query string survives the rewrite", () => {
  assertEquals(
    toEmailAssetUrl(
      `${CLOUD}/storage/v1/object/public/studio-logos/m/mark.png?width=80&v=3`,
      { supabaseUrl: CLOUD, assetHost: HOST },
    ),
    `${HOST}/storage/v1/object/public/studio-logos/m/mark.png?width=80&v=3`,
  );
});

Deno.test("a non-supabase URL is returned untouched", () => {
  const external = "https://cdn.vendor.example/images/chair.jpg";
  assertEquals(
    toEmailAssetUrl(external, { supabaseUrl: CLOUD, assetHost: HOST }),
    external,
  );
});

Deno.test("a signed (non-public) storage path is returned untouched", () => {
  const signed =
    `${CLOUD}/storage/v1/object/sign/project-documents/x.pdf?token=abc`;
  assertEquals(
    toEmailAssetUrl(signed, { supabaseUrl: CLOUD, assetHost: HOST }),
    signed,
  );
  const authenticated =
    `${CLOUD}/storage/v1/object/authenticated/studio-logos/mark.png`;
  assertEquals(
    toEmailAssetUrl(authenticated, { supabaseUrl: CLOUD, assetHost: HOST }),
    authenticated,
  );
});

Deno.test("a local stack URL is rewritten only when it IS the project origin", () => {
  const local = `${LOCAL}/storage/v1/object/public/studio-logos/m/mark.png`;
  assertEquals(
    toEmailAssetUrl(local, { supabaseUrl: LOCAL, assetHost: HOST }),
    `${HOST}/storage/v1/object/public/studio-logos/m/mark.png`,
  );
  // Same URL, but the project is the cloud one — 127.0.0.1 is then just some
  // other host and must not be touched.
  assertEquals(
    toEmailAssetUrl(local, { supabaseUrl: CLOUD, assetHost: HOST }),
    local,
  );
});

Deno.test("a local project origin is left alone unless an asset host was named", () => {
  const previous = Deno.env.get("EMAIL_ASSET_HOST");
  Deno.env.delete("EMAIL_ASSET_HOST");
  try {
    for (const origin of [LOCAL, "http://localhost:54321", "http://[::1]:54321"]) {
      const local = `${origin}/storage/v1/object/public/studio-logos/m/mark.png`;
      // No host configured: the default api.patina.cloud fronts the cloud
      // project, so a local URL must not be pointed at it.
      assertEquals(toEmailAssetUrl(local, { supabaseUrl: origin }), local);
      // Named explicitly: the caller means it.
      assertEquals(
        toEmailAssetUrl(local, { supabaseUrl: origin, assetHost: HOST }),
        `${HOST}/storage/v1/object/public/studio-logos/m/mark.png`,
      );
    }
  } finally {
    if (previous !== undefined) Deno.env.set("EMAIL_ASSET_HOST", previous);
  }
});

Deno.test("null, undefined and empty input yield null", () => {
  assertEquals(toEmailAssetUrl(null, { assetHost: HOST }), null);
  assertEquals(toEmailAssetUrl(undefined, { assetHost: HOST }), null);
  assertEquals(toEmailAssetUrl("   ", { assetHost: HOST }), null);
});

Deno.test("another *.supabase.co project is someone else's storage and is untouched", () => {
  const other =
    "https://otherproject.supabase.co/storage/v1/object/public/avatars/a.png";
  assertEquals(
    toEmailAssetUrl(other, { supabaseUrl: LOCAL, assetHost: HOST }),
    other,
  );
  assertEquals(
    toEmailAssetUrl(other, { supabaseUrl: CLOUD, assetHost: HOST }),
    other,
  );
});

Deno.test("a relative or unparseable URL passes through unchanged", () => {
  assertEquals(
    toEmailAssetUrl("/storage/v1/object/public/studio-logos/m.png", {
      supabaseUrl: CLOUD,
      assetHost: HOST,
    }),
    "/storage/v1/object/public/studio-logos/m.png",
  );
});

Deno.test("an SVG logo is recognised whatever its case, query or fragment", () => {
  assertEquals(isSvgAssetUrl(`${CLOUD}/storage/v1/object/public/l/mark.svg`), true);
  assertEquals(isSvgAssetUrl(`${CLOUD}/storage/v1/object/public/l/MARK.SVG`), true);
  assertEquals(
    isSvgAssetUrl(`${CLOUD}/storage/v1/object/public/l/mark.svg?v=2#a`),
    true,
  );
  assertEquals(isSvgAssetUrl("/logos/mark.svg?v=2"), true);
  assertEquals(isSvgAssetUrl(`${CLOUD}/storage/v1/object/public/l/mark.png`), false);
  assertEquals(isSvgAssetUrl(null), false);
  assertEquals(isSvgAssetUrl("  "), false);
});
