import { fieldLinkFixture } from "../inbound-fixture.ts";
import type { GateAssertion, GateCase } from "../types.ts";

const RAW_TOKEN = /[0-9a-f]{64}/i;

function wireBodies(
  requests: Array<{ url: string; init?: RequestInit }>,
): string[] {
  return requests
    .filter((r) => r.url.includes("/Messages.json"))
    .map((r) => new URLSearchParams(String(r.init?.body ?? "")).get("Body") ?? "");
}

/**
 * One project on the handset. A renewal is scoped to a party on a project, so a
 * sub who works for TWO studios on the same number is asked which one first —
 * that is the chooser's job and two-studios-one-phone's case, and it would
 * otherwise answer every probe below for the wrong reason. Here the second
 * studio's seat sits on its own handset so that what refuses a renewal is the
 * renewal rule being tested.
 */
function soloHandset() {
  const fixture = fieldLinkFixture(undefined, { FIELD_LINE_PHASE: "1" });
  fixture.h.fake._data.project_parties.find((p) => p.id === "party-b")!
    .phone_e164 = "+15550109999";
  return fixture;
}

/** An active token that has simply run out — the lapse a reply is allowed to cure. */
const EXPIRED = {
  id: "field-link-expired",
  party_id: "party-a",
  project_id: "project-a",
  token_hash: "e".repeat(64),
  expires_at: "2026-10-20T00:00:00.000Z",
  status: "active",
  last_used_at: null,
  created_at: "2026-09-20T00:00:00.000Z",
};

/**
 * Reply-to-renew (contract S6, clause P11). A sub whose link ran out last week
 * texts the number back — "can you resend that link" — and gets one line with a
 * working link. That is the whole feature, and it is worth having because the
 * alternative is a person on a job site with a dead URL and no way to ask.
 *
 * The three things it must NOT do are the reason this case exists:
 *   · a REVOKED link is not renewed. Expiry is a lapse; revocation is a person
 *     deciding this party should not have access, and an inbound text does not
 *     overturn it.
 *   · a SUPPRESSED pair is never texted. STOP outranks every convenience.
 *   · STOP itself never renews anything, even from a party whose link has run
 *     out — the compliance keywords are answered before this ever runs.
 *
 * S6 is asserted the same way it is everywhere else on this rail: the token is
 * minted when the text is dialled, exactly once, and the stored copy of the
 * thread keeps none of it.
 */
export const replyToRenew: GateCase = {
  id: "reply-to-renew",
  phase: 1,
  clauses: ["S6", "P11"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];
    const say = (
      clause: string,
      ok: boolean,
      pass: string,
      fail: string,
    ) =>
      assertions.push({
        caseId: "reply-to-renew",
        clause,
        status: ok ? "pass" : "fail",
        reason: ok ? pass : fail,
      });

    // ── The lapse a reply cures ───────────────────────────────────────────
    const lapsed = soloHandset();
    lapsed.h.fake._data.field_link_tokens.push({ ...EXPIRED });
    const before = lapsed.mints;
    const renewed = await lapsed.h.processInbound({
      Body: "can you send that link again",
      MessageSid: "SMrenewAsk",
    });
    const bodies = wireBodies(lapsed.h.provider.requests);
    const minted = lapsed.h.fake._data.field_link_tokens.filter((r) =>
      r.id !== EXPIRED.id
    );
    const onWire = bodies.filter((b) => /\/field\/[0-9a-f]{64}/i.test(b));
    const stored = (lapsed.h.fake._data.sms_messages ?? []).filter((m) =>
      m.direction === "outbound"
    );
    const s6 = renewed.disposition === "link_renewed" &&
      before === 0 && lapsed.mints === 1 && minted.length === 1 &&
      onWire.length === 1 && bodies.length === 1 &&
      minted[0].status === "active" &&
      Date.parse(String(minted[0].expires_at)) > lapsed.h.clock.getTime() &&
      // The row 00640 could have revoked is untouched: routine minting does not
      // revoke, and there was nothing left to revoke anyway.
      lapsed.h.fake._data.field_link_tokens.find((r) => r.id === EXPIRED.id)
          ?.status === "active" &&
      !stored.some((m) => RAW_TOKEN.test(String(m.body ?? "")));
    say(
      "S6",
      s6,
      `one link was minted at dispatch (${lapsed.mints}), it went out on the one text this reply sent, and the stored thread copy carries no token`,
      `expected disposition link_renewed with exactly one mint on the wire and a redacted stored copy; got disposition=${renewed.disposition} mintsBefore=${before} mints=${lapsed.mints} texts=${bodies.length} withLink=${onWire.length}`,
    );

    // ── Revoked is a decision, not a lapse ────────────────────────────────
    const revoked = soloHandset();
    revoked.h.fake._data.field_link_tokens.push(
      { ...EXPIRED },
      {
        ...EXPIRED,
        id: "field-link-revoked",
        status: "revoked",
        created_at: "2026-10-25T00:00:00.000Z",
        expires_at: "2026-12-01T00:00:00.000Z",
      },
    );
    const afterRevoke = await revoked.h.processInbound({
      Body: "can you send that link again",
      MessageSid: "SMrevokedAsk",
    });
    const revokedMints = revoked.mints;
    const revokedWire = wireBodies(revoked.h.provider.requests);

    // ── A suppressed pair is never texted ─────────────────────────────────
    const stopped = soloHandset();
    stopped.h.fake._data.field_link_tokens.push({ ...EXPIRED });
    stopped.h.fake._data.sms_suppressions = [{
      sender_number: stopped.h.sender,
      recipient_phone: stopped.h.recipient,
      lifted_at: null,
    }];
    const afterStop = await stopped.h.processInbound({
      Body: "can you send that link again",
      MessageSid: "SMsuppressedAsk",
    });

    // ── STOP is a stop, from anyone, lapsed link or not ───────────────────
    const saysStop = soloHandset();
    saysStop.h.fake._data.field_link_tokens.push({ ...EXPIRED });
    const afterStopWord = await saysStop.h.processInbound({
      Body: "STOP",
      MessageSid: "SMstopWord",
    });

    const p11 = afterRevoke.disposition !== "link_renewed" &&
      revokedMints === 0 &&
      !revokedWire.some((b) => /\/field\//i.test(b)) &&
      afterStop.disposition !== "link_renewed" && stopped.mints === 0 &&
      afterStopWord.disposition !== "link_renewed" && saysStop.mints === 0 &&
      // And the suppressed party's own record was not quietly rewritten.
      saysStop.h.fake._data.field_link_tokens.every((r) =>
        r.id === EXPIRED.id
      );
    say(
      "P11",
      p11,
      `a newer revoked token refuses the renewal (${afterRevoke.disposition}, ${revokedMints} mints), a suppressed pair refuses it (${afterStop.disposition}), and STOP still just stops (${afterStopWord.disposition})`,
      `expected no renewal for revoked/suppressed/STOP; got revoked=${afterRevoke.disposition}/${revokedMints} suppressed=${afterStop.disposition}/${stopped.mints} stop=${afterStopWord.disposition}/${saysStop.mints}`,
    );

    return assertions;
  },
};
