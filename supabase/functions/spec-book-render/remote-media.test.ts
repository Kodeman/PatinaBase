// deno-lint-ignore-file no-import-prefix

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { safeRemoteImageUrl } from "./remote-media.ts";

const SUPABASE_URL = "http://127.0.0.1:54321";

Deno.test("remote image URLs allow HTTPS and the configured Supabase origin", () => {
  assertExists(
    safeRemoteImageUrl("https://images.example.test/chair.jpg", SUPABASE_URL),
  );
  assertExists(
    safeRemoteImageUrl(
      "http://127.0.0.1:54321/storage/v1/object/public/product-images/chair.jpg",
      SUPABASE_URL,
    ),
  );
});

Deno.test("remote image URLs reject credentials, insecure origins, and local names", () => {
  const rejected = [
    "https://user:secret@images.example.test/chair.jpg",
    "http://images.example.test/chair.jpg",
    "https://localhost/chair.jpg",
    "https://assets.local/chair.jpg",
    "https://metadata.internal/chair.jpg",
  ];
  for (const value of rejected) {
    assertEquals(safeRemoteImageUrl(value, SUPABASE_URL), null, value);
  }
});

Deno.test("remote image URLs reject private and reserved IPv4 variants", () => {
  const rejected = [
    "https://0.0.0.0/chair.jpg",
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
  for (const value of rejected) {
    assertEquals(safeRemoteImageUrl(value, SUPABASE_URL), null, value);
  }
});

Deno.test("remote image URLs reject IPv6 loopback, local, and mapped addresses", () => {
  const rejected = [
    "https://[::]/chair.jpg",
    "https://[::1]/chair.jpg",
    "https://[fc00::1]/chair.jpg",
    "https://[fd12:3456::1]/chair.jpg",
    "https://[fe80::1]/chair.jpg",
    "https://[ff02::1]/chair.jpg",
    "https://[2001:db8::1]/chair.jpg",
    "https://[::ffff:127.0.0.1]/chair.jpg",
    "https://[::ffff:a9fe:a9fe]/latest/meta-data",
  ];
  for (const value of rejected) {
    assertEquals(safeRemoteImageUrl(value, SUPABASE_URL), null, value);
  }
});
