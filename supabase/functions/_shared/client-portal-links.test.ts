import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  clientDecisionLink,
  clientProjectDeepLink,
  clientProjectLink,
} from "./client-portal-links.ts";

const BASE = "https://client.patina.cloud";

Deno.test("names the project and the section", () => {
  assertEquals(
    clientProjectLink(BASE, "proj-1", "road"),
    "https://client.patina.cloud/projects/proj-1#road",
  );
});

Deno.test("falls back to the active project when there is no project to name", () => {
  assertEquals(
    clientProjectLink(BASE, null, "note"),
    "https://client.patina.cloud/#note",
  );
  assertEquals(
    clientProjectLink(BASE, undefined, "doorstep"),
    "https://client.patina.cloud/#doorstep",
  );
});

Deno.test("puts the query before the fragment so the section still reads it", () => {
  assertEquals(
    clientProjectLink(BASE, "proj-1", "road", { order: "ord-1" }),
    "https://client.patina.cloud/projects/proj-1?order=ord-1#road",
  );
  assertEquals(
    clientProjectLink(BASE, "proj-1", "letterbox", {
      invoice: "inv-1",
      checkout: "success",
    }),
    "https://client.patina.cloud/projects/proj-1?invoice=inv-1&checkout=success#letterbox",
  );
});

Deno.test("tolerates a trailing slash on the configured origin", () => {
  assertEquals(
    clientProjectLink("https://client.patina.cloud/", "proj-1", "ledger"),
    "https://client.patina.cloud/projects/proj-1#ledger",
  );
});

Deno.test("refuses an id that is not a plain segment rather than forging a path", () => {
  assertEquals(
    clientProjectLink(BASE, "../../evil", "note"),
    "https://client.patina.cloud/#note",
  );
  assertEquals(
    clientProjectLink(BASE, "proj 1", "note"),
    "https://client.patina.cloud/#note",
  );
});

Deno.test("escapes param values", () => {
  assertEquals(
    clientProjectLink(BASE, null, "letterbox", { invoice: "a b&c" }),
    "https://client.patina.cloud/?invoice=a%20b%26c#letterbox",
  );
});

Deno.test("drops empty params", () => {
  assertEquals(
    clientProjectLink(BASE, "proj-1", "road", { order: "" }),
    "https://client.patina.cloud/projects/proj-1#road",
  );
});

Deno.test("deep links are portal-relative", () => {
  assertEquals(
    clientProjectDeepLink("proj-1", "letterbox", { invoice: "inv-1" }),
    "/projects/proj-1?invoice=inv-1#letterbox",
  );
  assertEquals(clientProjectDeepLink(null, "road"), "/#road");
});

Deno.test("an approval is addressed by its own id, not by an anchor", () => {
  assertEquals(
    clientDecisionLink(BASE, "dec-1"),
    "https://client.patina.cloud/decisions/dec-1",
  );
  assertEquals(
    clientDecisionLink("https://client.patina.cloud/", "dec-1"),
    "https://client.patina.cloud/decisions/dec-1",
  );
});

Deno.test("an approval id that is not a plain segment lands on the doorstep", () => {
  assertEquals(
    clientDecisionLink(BASE, "../../evil"),
    "https://client.patina.cloud/#doorstep",
  );
  assertEquals(
    clientDecisionLink(BASE, null),
    "https://client.patina.cloud/#doorstep",
  );
});
