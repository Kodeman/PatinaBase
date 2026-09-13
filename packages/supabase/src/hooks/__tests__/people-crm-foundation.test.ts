import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// W2a — the foundation's PURE parts.
//
// Two builders are about to write the People room's surfaces on top of these,
// so what is pinned here is the CONTRACT: one canonical query key per entity,
// and one banding rule for the Call Sheet. No Supabase client is mocked and no
// hook is rendered — every function under test is pure, which is exactly why
// they were written pure.
// ─────────────────────────────────────────────────────────────────────────────

import { peopleKeys, peopleSeatKeys } from '../use-people';
import { consentKeys } from '../use-consent';
import {
  accessGrantKeys,
  accessGrantNaturalKey,
  accessGrantRevokeRoute,
  isAccessGrantRevokable,
  ACCESS_GRANT_REVOKE_ROUTES,
  ALL_ACCESS_GRANT_TIERS,
} from '../use-access-grants';
import {
  studioChannelKeys,
  contactRuleKeys,
  affiliationKeys,
  complianceKeys,
  isContactChannelHeld,
  complianceDocRequiresExpiry,
} from '../use-studio-contacts';
import {
  partyAuthorityKeys,
  siteAccessKeys,
  rosterBandFor,
  rosterDateKey,
  groupRosterByWindow,
  seatDeleteRefusal,
  isAdminOnlyAuthorityScope,
  ROSTER_BANDS,
  type RosterWindowSeat,
} from '../use-coordination';

// ═══════════════════════════════════════════════════════════════════════════
// Query keys — one canonical key per entity
// ═══════════════════════════════════════════════════════════════════════════

describe('query keys · one canonical prefix per entity', () => {
  it('gives every People-room entity its own root, and no two roots collide', () => {
    const roots = [
      peopleKeys.all[0],
      peopleSeatKeys.all[0],
      consentKeys.all[0],
      accessGrantKeys.all[0],
      studioChannelKeys.list('x')[0],
      contactRuleKeys.all[0],
      affiliationKeys.all[0],
      complianceKeys.all[0],
      partyAuthorityKeys.all[0],
      siteAccessKeys.all[0],
    ];
    expect(new Set(roots).size).toBe(roots.length);
  });

  it('keeps every entity key UNDER its own root, so an invalidate on the root reaches it', () => {
    // React Query invalidates by key PREFIX. A detail key that does not start
    // with its list root is a key no mutation's fan-out can ever reach — the
    // exact defect that leaves a stale row on screen after a successful write.
    expect(peopleKeys.list({ role: 'all' })[0]).toBe(peopleKeys.all[0]);
    expect(peopleKeys.person('p1', 'contact')[0]).toBe(peopleKeys.all[0]);
    expect(peopleSeatKeys.list({ projectId: 'j1' })[0]).toBe(peopleSeatKeys.all[0]);
    expect(peopleSeatKeys.seat('s1')[0]).toBe(peopleSeatKeys.all[0]);
    expect(consentKeys.record('o1', 'sms', '+16125550111')[0]).toBe(consentKeys.all[0]);
    expect(accessGrantKeys.list({ tier: 'field_link' })[0]).toBe(accessGrantKeys.all[0]);
    expect(complianceKeys.state('c1')[0]).toBe(complianceKeys.all[0]);
    expect(partyAuthorityKeys.list('e1')[0]).toBe(partyAuthorityKeys.all[0]);
    expect(siteAccessKeys.detail('j1')[0]).toBe(siteAccessKeys.all[0]);
  });

  it('separates the directory from the seats view — they are two read models', () => {
    // v4 nests seats BENEATH an identity, but they are separate queries with
    // separate RLS legs. One root for both would make a seat write blow away
    // the whole Directory and vice versa.
    expect(peopleKeys.all[0]).not.toBe(peopleSeatKeys.all[0]);
  });

  it('keys a consent record on all three parts of its primary key', () => {
    // The record's PK is (organization_id, channel_kind, channel_value). Any
    // key narrower than that would let one studio's verdict be served from
    // another studio's cache entry.
    const a = consentKeys.record('org-a', 'sms', '+16125550111');
    const b = consentKeys.record('org-b', 'sms', '+16125550111');
    const c = consentKeys.record('org-a', 'email', '+16125550111');
    const d = consentKeys.record('org-a', 'sms', '+16125550112');
    const all = [a, b, c, d].map((k) => JSON.stringify(k));
    expect(new Set(all).size).toBe(4);
  });

  it('gives a null id its own stable key rather than an undefined hole', () => {
    expect(peopleKeys.person(null)).toEqual(['people-directory', 'person', null, null]);
    expect(peopleSeatKeys.seat(undefined)).toEqual([
      'people-directory-seats',
      'seat',
      null,
    ]);
    expect(siteAccessKeys.detail(undefined)).toEqual(['project-site-access', null]);
  });

  it('folds an omitted filter bag to {} so two callers share one cache entry', () => {
    expect(peopleKeys.list()).toEqual(peopleKeys.list(undefined));
    expect(JSON.stringify(peopleKeys.list())).toBe(
      JSON.stringify(['people-directory', {}]),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The revoke routing table (E9)
// ═══════════════════════════════════════════════════════════════════════════

describe('access grants · the revoke routing table', () => {
  it('names all eleven tiers, so a new tier cannot be silently unrouted', () => {
    expect(Object.keys(ACCESS_GRANT_REVOKE_ROUTES).sort()).toEqual(
      [...ALL_ACCESS_GRANT_TIERS].sort(),
    );
  });

  it('routes only the four tiers that have a revoke RPC reachable from a grant row', () => {
    const routable = ALL_ACCESS_GRANT_TIERS.filter(isAccessGrantRevokable);
    expect([...routable].sort()).toEqual(
      ['doc_share', 'field_link', 'plan_link', 'project_review'].sort(),
    );
  });

  it('leaves site_request unrouted — its RPC takes the REQUEST id, which the view does not carry', () => {
    // `site_request_revoke_access(p_request_id)` exists, but v_access_grants'
    // natural key is the ACCESS row's id. Routing it would pass the wrong uuid
    // to a definer function.
    expect(accessGrantRevokeRoute('site_request')).toBeNull();
  });

  it('flags project_review as closing the WHOLE scope, and requiring a reason', () => {
    // `revoke_project_review_access` revokes every actor on the edition, so a
    // per-row Revoke closes everyone's door. The surface must say so before
    // the act; the flag is how it knows.
    const route = accessGrantRevokeRoute('project_review');
    expect(route?.revokesWholeScope).toBe(true);
    expect(route?.reasonRequired).toBe(true);
  });

  it('pulls the RPC argument out of `<tier>:<key>`, including the three-part id', () => {
    const fieldLink = accessGrantRevokeRoute('field_link')!;
    expect(accessGrantNaturalKey('field_link:abc-123', fieldLink)).toBe('abc-123');

    // project_review:<edition>:<actor> — the RPC takes the EDITION, segment 1.
    const review = accessGrantRevokeRoute('project_review')!;
    expect(accessGrantNaturalKey('project_review:ed-1:actor-9', review)).toBe('ed-1');
  });

  it('returns null for a grant_id with no key, rather than sending "undefined" to Postgres', () => {
    const fieldLink = accessGrantRevokeRoute('field_link')!;
    expect(accessGrantNaturalKey('field_link', fieldLink)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The Call Sheet's four bands
// ═══════════════════════════════════════════════════════════════════════════

const TODAY = '2026-10-20'; // the specimen date

function seat(partial: Partial<RosterWindowSeat>): RosterWindowSeat {
  return { stage: 'active', on_site_from: null, on_site_to: null, ...partial };
}

describe('roster bands · stage first, then the window', () => {
  it('reads a window that covers today as this week', () => {
    expect(
      rosterBandFor(
        seat({ stage: 'active', on_site_from: '2026-10-19', on_site_to: '2027-06-30' }),
        TODAY,
      ),
    ).toBe('this_week');
  });

  it('reads a window that opens in the future as later', () => {
    // F-19's radon sub (2027-02) and F-24's stager (2027-08) read as active
    // crew today without this rule — the whole point of CS2-18.
    expect(
      rosterBandFor(seat({ stage: 'awarded', on_site_from: '2027-02-01' }), TODAY),
    ).toBe('later');
  });

  it('puts a crew seat with NO window in this week rather than dropping it', () => {
    expect(rosterBandFor(seat({ stage: 'mobilized' }), TODAY)).toBe('this_week');
    expect(rosterBandFor(seat({ stage: 'active' }), TODAY)).toBe('this_week');
  });

  it('bands every bid stage as Bidding, never mixed into crew (CRM-20)', () => {
    for (const stage of ['prospect', 'invited', 'bidding', 'declined', 'no_response']) {
      expect(rosterBandFor(seat({ stage }), TODAY)).toBe('bidding');
    }
  });

  it('keeps a bidder in Bidding even when it carries a projected window', () => {
    // A bid with a start date is still a bid. Stage outranks the window, or
    // Rivera Finishes turns up among the crew.
    expect(
      rosterBandFor(
        seat({ stage: 'no_response', on_site_from: '2026-10-19', on_site_to: '2026-12-01' }),
        TODAY,
      ),
    ).toBe('bidding');
  });

  it('bands closeout, warranty, off_job and retired as Done', () => {
    for (const stage of ['closeout', 'warranty', 'off_job', 'retired']) {
      expect(rosterBandFor(seat({ stage }), TODAY)).toBe('done');
    }
  });

  it("keeps Dana's warranty seat in Done though its window opened long ago", () => {
    // Lindqvist kitchen: on site 2025-05-05 to 2025-10-15, stage warranty.
    expect(
      rosterBandFor(
        seat({ stage: 'warranty', on_site_from: '2025-05-05', on_site_to: '2025-10-15' }),
        TODAY,
      ),
    ).toBe('done');
  });

  it('keeps a crew seat whose window CLOSED in this week rather than losing it', () => {
    // Nothing moves a seat to Done but its stage. A crew seat past its window
    // is a seat the studio has not closed yet, and it must stay visible.
    expect(
      rosterBandFor(
        seat({ stage: 'active', on_site_from: '2026-01-01', on_site_to: '2026-09-01' }),
        TODAY,
      ),
    ).toBe('this_week');
  });

  it('bands a seat with no stage at all by its window alone', () => {
    expect(rosterBandFor(seat({ stage: null, on_site_from: '2027-02-01' }), TODAY)).toBe(
      'later',
    );
    expect(rosterBandFor(seat({ stage: null }), TODAY)).toBe('this_week');
  });

  it('groups into all four bands, and keeps the empty ones', () => {
    const grouped = groupRosterByWindow(
      [
        seat({ stage: 'active', on_site_from: '2026-10-19' }),
        seat({ stage: 'awarded', on_site_from: '2027-05-04' }),
        seat({ stage: 'no_response' }),
      ],
      TODAY,
    );
    expect(Object.keys(grouped).sort()).toEqual([...ROSTER_BANDS].sort());
    expect(grouped.this_week).toHaveLength(1);
    expect(grouped.later).toHaveLength(1);
    expect(grouped.bidding).toHaveLength(1);
    // Empty bands survive, so the Call Sheet's headings do not move about as a
    // job turns over.
    expect(grouped.done).toEqual([]);
  });

  it('bands every seat exactly once', () => {
    const seats = [
      seat({ stage: 'active' }),
      seat({ stage: 'bidding' }),
      seat({ stage: 'warranty' }),
      seat({ stage: 'awarded', on_site_from: '2027-01-01' }),
    ];
    const grouped = groupRosterByWindow(seats, TODAY);
    const total = ROSTER_BANDS.reduce((n, band) => n + grouped[band].length, 0);
    expect(total).toBe(seats.length);
  });

  it('formats a date key in the LOCAL calendar day, never through toISOString', () => {
    // `on_site_from` is a DATE column. Comparing it against a UTC-shifted key
    // bands a seat a day early west of UTC, which on a Monday morning is the
    // difference between "this week" and "later".
    expect(rosterDateKey(new Date(2026, 9, 20, 23, 30))).toBe('2026-10-20');
    expect(rosterDateKey(new Date(2026, 0, 1, 0, 15))).toBe('2026-01-01');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The mistaken-add predicate, and the small typed rules beside it
// ═══════════════════════════════════════════════════════════════════════════

describe('seat delete · the mistaken-add predicate', () => {
  const none = { hasConsentRecord: false, hasBid: false, hasComplianceDocument: false };

  it('permits a delete only for a seat carrying nothing', () => {
    expect(seatDeleteRefusal(none)).toBeNull();
  });

  it('refuses on a consent record, a bid, or paper the studio holds', () => {
    expect(seatDeleteRefusal({ ...none, hasConsentRecord: true })).toBe('consent');
    expect(seatDeleteRefusal({ ...none, hasBid: true })).toBe('bid');
    expect(seatDeleteRefusal({ ...none, hasComplianceDocument: true })).toBe('waiver');
  });

  it('names consent first when several facts stand', () => {
    // The order is the order of cost: a lost consent record is a compliance
    // fact, and it is the one the sentence should name.
    expect(
      seatDeleteRefusal({
        hasConsentRecord: true,
        hasBid: true,
        hasComplianceDocument: true,
      }),
    ).toBe('consent');
  });
});

describe('the small typed rules', () => {
  it('reserves money and draw certification to an owner or admin (PR-n)', () => {
    expect(isAdminOnlyAuthorityScope('money')).toBe(true);
    expect(isAdminOnlyAuthorityScope('draw_certify')).toBe(true);
    expect(isAdminOnlyAuthorityScope('selections')).toBe(false);
    expect(isAdminOnlyAuthorityScope(null)).toBe(false);
  });

  it('treats every channel status but active as held', () => {
    expect(isContactChannelHeld('active')).toBe(false);
    expect(isContactChannelHeld('bounced')).toBe(true);
    expect(isContactChannelHeld('unsubscribed')).toBe(true);
    expect(isContactChannelHeld('dead')).toBe(true);
    // An unknown status is not "fine": a channel whose state the room cannot
    // read is one it should show the reason for.
    expect(isContactChannelHeld(null)).toBe(false);
  });

  it('requires an expiry on exactly the dated document types', () => {
    // An undated paper is HELD and cannot lapse (C21/R-K) — a W-9 has no
    // expiry, and a COI without one would read `current` for ever.
    expect(complianceDocRequiresExpiry('coi_gl')).toBe(true);
    expect(complianceDocRequiresExpiry('license')).toBe(true);
    expect(complianceDocRequiresExpiry('bond')).toBe(true);
    expect(complianceDocRequiresExpiry('w9')).toBe(false);
    expect(complianceDocRequiresExpiry('lien_waiver_conditional')).toBe(false);
    expect(complianceDocRequiresExpiry('other_named')).toBe(false);
  });
});
