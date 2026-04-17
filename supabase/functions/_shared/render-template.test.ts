// Deno test for the shared render-template interpolator.
// Run: deno test supabase/functions/_shared/render-template.test.ts
//
// Uses assertEquals from Deno std so no extra deps are required.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { interpolate } from "./render-template.ts";

Deno.test("interpolate replaces single token", () => {
  assertEquals(interpolate("Hi {{name}}", { name: "Kody" }), "Hi Kody");
});

Deno.test("interpolate handles whitespace inside braces", () => {
  assertEquals(interpolate("Hi {{ name }}", { name: "Kody" }), "Hi Kody");
});

Deno.test("interpolate replaces missing keys with empty string", () => {
  assertEquals(interpolate("Hi {{name}}!", {}), "Hi !");
});

Deno.test("interpolate handles multiple tokens", () => {
  assertEquals(
    interpolate("{{greeting}}, {{name}}", { greeting: "Hi", name: "Kody" }),
    "Hi, Kody"
  );
});

Deno.test("interpolate preserves non-token braces", () => {
  assertEquals(interpolate("hello { name }", { name: "Kody" }), "hello { name }");
});

Deno.test("interpolate resolves dotted keys", () => {
  assertEquals(
    interpolate("{{user.name}}", { user: { name: "Kody" } }),
    "Kody"
  );
});

Deno.test("interpolate coerces numbers and booleans", () => {
  assertEquals(
    interpolate("{{amount}} {{active}}", { amount: 42, active: true }),
    "42 true"
  );
});

Deno.test("interpolate preserves HTML structure", () => {
  const template = `<a href="{{url}}">Click</a>`;
  assertEquals(
    interpolate(template, { url: "https://example.com" }),
    `<a href="https://example.com">Click</a>`
  );
});
