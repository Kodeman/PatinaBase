/**
 * @jest-environment node
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  CONSENT_LINES,
  KIND_LABEL,
  REFUSAL_TOKENS,
  SIGNATURE_NOTICE,
  SIGN_LABELS,
  SUMMARY_FRAGMENTS,
  consentLineFor,
  refusalSentence,
  signLabelFor,
  summaryLineFor,
} from "../consent-copy";

// ── The drift guard ─────────────────────────────────────────────────────────
// consent-copy.ts used to be a COPY of the ceremony at /proposals/<id>/sign,
// and this guard read that page off disk to hold the two together. The page is
// retired: the door signs in place, reading its consent line, act label,
// summary and signature notice straight from consent-copy.ts, so there is no
// second copy left to drift from and nothing to read. What remains on disk is
// the API's own vocabulary — the refusal tokens the route can answer with, and
// the kind labels the portal uses — and those are still held here verbatim.

const SRC = join(__dirname, "..", "..", "..");
const SIGN_ROUTE = readFileSync(
  join(SRC, "app/api/proposals/[id]/sign/route.ts"),
  "utf8",
);
const KIND_CARDS = readFileSync(
  join(SRC, "components/commercial/awaiting-signature-cards.tsx"),
  "utf8",
);

describe("the door’s vocabulary is the API’s, verbatim", () => {
  it("carries a consent line, act label and summary for every kind it signs", () => {
    expect(CONSENT_LINES.length).toBeGreaterThan(0);
    expect(SIGN_LABELS.length).toBeGreaterThan(0);
    expect(SUMMARY_FRAGMENTS.length).toBeGreaterThan(0);
    expect(SIGNATURE_NOTICE.length).toBeGreaterThan(0);
  });

  it.each(REFUSAL_TOKENS)(
    "the API can still answer with the token: %s",
    (token) => {
      expect(SIGN_ROUTE).toContain(`error: '${token}'`);
    },
  );

  it.each(Object.entries(KIND_LABEL))(
    "kind label %s matches the portal vocabulary",
    (kind, label) => {
      expect(KIND_CARDS).toContain(`${kind}: '${label}'`);
    },
  );
});

describe("the branch structure mirrors the route", () => {
  it("gives a furnishings authorization its own consent, label and summary", () => {
    expect(consentLineFor("furnishings_authorization")).toContain(
      "any required deposit is a separate payment step",
    );
    expect(signLabelFor("furnishings_authorization")).toBe(
      "Sign authorization",
    );
    expect(summaryLineFor("furnishings_authorization", "No. 7")).toBe(
      "By signing, you authorize only the named furnishing lines, quantities, and client prices in “No. 7”.",
    );
  });

  it("gives a trade scope its own consent, label and summary", () => {
    expect(consentLineFor("trade_scope")).toContain(
      "each remaining draw is billed",
    );
    expect(signLabelFor("trade_scope")).toBe("Sign and authorize");
    expect(summaryLineFor("trade_scope", "TS-2")).toContain(
      "the scope of work, price, and draw schedule",
    );
  });

  it("gives both design-services kinds the countersign consent", () => {
    const services = consentLineFor("design_services");
    expect(consentLineFor("service_addendum")).toBe(services);
    expect(services).toContain("my signature alone does not authorize work");
    expect(signLabelFor("design_services")).toBe("Sign and accept");
    expect(signLabelFor("service_addendum")).toBe("Sign and accept");
  });

  it("falls back the way the route’s else branch does", () => {
    expect(consentLineFor("legacy")).toBe(
      "I agree to the scope and investment in this proposal.",
    );
  });

  it("never asserts a countersignature on a furnishings authorization", () => {
    expect(consentLineFor("furnishings_authorization")).not.toContain(
      "countersign",
    );
    expect(consentLineFor("trade_scope")).not.toContain("countersign");
  });
});

describe("refusalSentence", () => {
  it.each([
    ["not_signable", "not open for signing"],
    ["proposal_expired", "expired"],
    ["unauthorized", "Sign in again"],
    ["invalid_name", "Type your full name"],
    ["not_found", "could not be found"],
    ["legacy_signing_retired", "new agreement"],
  ])("turns %s into a sentence", (token, fragment) => {
    expect(refusalSentence(token)).toContain(fragment);
  });

  it("keeps an unrecognized message as written", () => {
    expect(refusalSentence("The studio withdrew this paper.")).toBe(
      "The studio withdrew this paper.",
    );
  });

  it("has something to say when the API says nothing", () => {
    expect(refusalSentence(undefined)).toBe(
      "This paper could not be signed just now.",
    );
    expect(refusalSentence("  ")).toBe(
      "This paper could not be signed just now.",
    );
  });
});
