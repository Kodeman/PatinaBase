import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bearerRole,
  derivativeObjectPaths,
  derivativePaths,
  isJpeg,
  isProcessableImage,
  validImmutableObjectPath,
} from "./core.ts";

function fakeJwt(role: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode({ role })}.signature`;
}

Deno.test("maintenance boundary accepts only a decoded service role", () => {
  assertEquals(bearerRole(`Bearer ${fakeJwt("service_role")}`), "service_role");
  assertEquals(
    bearerRole(`Bearer ${fakeJwt("authenticated")}`),
    "authenticated",
  );
  assertEquals(bearerRole("Bearer malformed"), null);
});

Deno.test("derivative paths remain inside the immutable request/version/attempt directory", () => {
  const original =
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/3/original.heic";
  assert(validImmutableObjectPath(original));
  assertEquals(
    derivativePaths({
      id: "33333333-3333-4333-8333-333333333333",
      object_path: original,
    }),
    {
      thumbnail:
        "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/3/derivatives/33333333-3333-4333-8333-333333333333_512.jpg",
      preview:
        "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/3/derivatives/33333333-3333-4333-8333-333333333333_1600.jpg",
    },
  );
  assertThrows(() =>
    derivativePaths({ id: "x", object_path: "../../storage/object" })
  );
});

Deno.test("purge accepts only recorded derivative paths and known image inputs", () => {
  assertEquals(
    derivativeObjectPaths({
      thumbnail_path:
        "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/3/derivatives/33333333-3333-4333-8333-333333333333_512.jpg",
      preview_path: "../../other-bucket/private.jpg",
    }),
    [
      "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/3/derivatives/33333333-3333-4333-8333-333333333333_512.jpg",
    ],
  );
  assert(isProcessableImage("image/jpeg"));
  assert(isProcessableImage("image/heic"));
  assert(!isProcessableImage("application/octet-stream"));
  assert(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0x00])));
});
