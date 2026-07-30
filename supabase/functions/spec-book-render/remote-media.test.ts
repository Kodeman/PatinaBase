// deno-lint-ignore-file no-import-prefix

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseAllowedRemoteImageOrigins,
  safeRemoteImageRedirectUrl,
  safeRemoteImageUrl,
} from "./remote-media.ts";

const SUPABASE_URL = "http://127.0.0.1:54321";

Deno.test("remote image URLs allow only exact configured HTTPS origins and Supabase", () => {
  const allowed = parseAllowedRemoteImageOrigins(
    "https://images.example.test, https://cdn.example.test:8443/",
  );
  assertExists(
    safeRemoteImageUrl(
      "https://images.example.test/chair.jpg",
      SUPABASE_URL,
      allowed,
    ),
  );
  assertExists(
    safeRemoteImageUrl(
      "https://cdn.example.test:8443/chair.jpg",
      SUPABASE_URL,
      allowed,
    ),
  );
  assertExists(
    safeRemoteImageUrl(
      "http://127.0.0.1:54321/storage/v1/object/public/product-images/chair.jpg",
      SUPABASE_URL,
      allowed,
    ),
  );

  const rejected = [
    "https://unlisted.example.test/chair.jpg",
    "https://images.example.test.evil.test/chair.jpg",
    "https://sub.images.example.test/chair.jpg",
    "https://images.example.test:8443/chair.jpg",
    "https://cdn.example.test/chair.jpg",
  ];
  for (const value of rejected) {
    assertEquals(
      safeRemoteImageUrl(value, SUPABASE_URL, allowed),
      null,
      value,
    );
  }
});

Deno.test("missing or empty allowlist rejects arbitrary external hosts", () => {
  for (const configured of [undefined, "", " , "]) {
    const allowed = parseAllowedRemoteImageOrigins(configured);
    assertEquals(allowed.size, 0);
    assertEquals(
      safeRemoteImageUrl(
        "https://images.example.test/chair.jpg",
        SUPABASE_URL,
        allowed,
      ),
      null,
    );
    assertExists(
      safeRemoteImageUrl(
        "http://127.0.0.1:54321/storage/v1/object/public/chair.jpg",
        SUPABASE_URL,
        allowed,
      ),
    );
  }
});

Deno.test("allowlist parser ignores non-origin, insecure, credentialed, and local entries", () => {
  const allowed = parseAllowedRemoteImageOrigins([
    "https://images.example.test",
    "http://insecure.example.test",
    "https://user:secret@credentials.example.test",
    "https://path.example.test/images",
    "https://query.example.test/?tenant=one",
    "https://*.wildcard.example.test",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "not a URL",
  ].join(","));
  assertEquals([...allowed], ["https://images.example.test"]);
});

Deno.test("remote image URLs reject credentials, insecure origins, and local names even if listed", () => {
  const rejected = [
    "https://user:secret@images.example.test/chair.jpg",
    "http://images.example.test/chair.jpg",
    "https://localhost/chair.jpg",
    "https://assets.local/chair.jpg",
    "https://metadata.internal/chair.jpg",
  ];
  const explicitlyListed = new Set(
    rejected.map((value) => new URL(value).origin),
  );
  for (const value of rejected) {
    assertEquals(
      safeRemoteImageUrl(value, SUPABASE_URL, explicitlyListed),
      null,
      value,
    );
  }
});

Deno.test("remote image URLs reject literal and reserved IPv4 variants even if listed", () => {
  const rejected = [
    "https://0.0.0.0/chair.jpg",
    "https://8.8.8.8/chair.jpg",
    "https://10.0.0.1/chair.jpg",
    "https://100.64.0.1/chair.jpg",
    "https://127.0.0.1/chair.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://172.31.0.1/chair.jpg",
    "https://192.168.0.1/chair.jpg",
    "https://198.18.0.1/chair.jpg",
    "https://198.51.100.1/chair.jpg",
    "https://203.0.113.1/chair.jpg",
    "https://224.0.0.1/chair.jpg",
    "https://2130706433/chair.jpg",
  ];
  const explicitlyListed = new Set(
    rejected.map((value) => new URL(value).origin),
  );
  for (const value of rejected) {
    assertEquals(
      safeRemoteImageUrl(value, SUPABASE_URL, explicitlyListed),
      null,
      value,
    );
  }
});

Deno.test("remote image URLs reject IPv6 literals even if listed", () => {
  const rejected = [
    "https://[::]/chair.jpg",
    "https://[::1]/chair.jpg",
    "https://[2606:4700:4700::1111]/chair.jpg",
    "https://[fc00::1]/chair.jpg",
    "https://[fd12:3456::1]/chair.jpg",
    "https://[fe80::1]/chair.jpg",
    "https://[ff02::1]/chair.jpg",
    "https://[2001:db8::1]/chair.jpg",
    "https://[::ffff:127.0.0.1]/chair.jpg",
    "https://[::ffff:a9fe:a9fe]/latest/meta-data",
  ];
  const explicitlyListed = new Set(
    rejected.map((value) => new URL(value).origin),
  );
  for (const value of rejected) {
    assertEquals(
      safeRemoteImageUrl(value, SUPABASE_URL, explicitlyListed),
      null,
      value,
    );
  }
});

Deno.test("redirect targets are resolved and revalidated against exact origins", () => {
  const allowed = parseAllowedRemoteImageOrigins(
    "https://images.example.test,https://cdn.example.test:8443",
  );
  const current = safeRemoteImageUrl(
    "https://images.example.test/chair.jpg",
    SUPABASE_URL,
    allowed,
  );
  assertExists(current);
  assertExists(
    safeRemoteImageRedirectUrl(
      "/optimized/chair.jpg",
      current,
      SUPABASE_URL,
      allowed,
    ),
  );
  assertExists(
    safeRemoteImageRedirectUrl(
      "https://cdn.example.test:8443/chair.jpg",
      current,
      SUPABASE_URL,
      allowed,
    ),
  );

  const rejected = [
    "https://unlisted.example.test/chair.jpg",
    "https://images.example.test.evil.test/chair.jpg",
    "https://cdn.example.test/chair.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://user:secret@images.example.test/chair.jpg",
  ];
  for (const location of rejected) {
    assertEquals(
      safeRemoteImageRedirectUrl(
        location,
        current,
        SUPABASE_URL,
        allowed,
      ),
      null,
      location,
    );
  }
});
