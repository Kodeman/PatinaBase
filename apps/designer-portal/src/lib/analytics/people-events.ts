/**
 * People room event taxonomy (People room CRM, "Everyone on the Job").
 *
 * Eight events, one per act the room owns. They answer the questions the
 * program was built to answer — does the studio narrow the book, does it open
 * the human or the firm, does consent get recorded rather than assumed, does a
 * door get minted and closed, does a seat get CLOSED rather than deleted, is
 * the way in kept current, and does the rolodex actually travel forward onto a
 * new job.
 *
 * The room is a STUDIO surface, and the promise is that the studio will not
 * notice Patina — so nothing here is an engagement metric. Every event carries
 * the shape of one act, never a dwell time, a scroll depth or a session count.
 *
 * No-ops when PostHog is not initialized (the `track()` guard) — mirrors
 * studio-events.ts / procurement-events.ts. Never call `posthog.capture`
 * inline at a call site.
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: object): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

/** The event names, exported so a test can pin the taxonomy without importing
 *  posthog-js. */
export const PEOPLE_EVENT_NAMES = {
  directoryChip: 'people_directory_chip',
  personCardOpened: 'people_person_card_opened',
  companyCardOpened: 'people_company_card_opened',
  consentRecorded: 'people_consent_recorded',
  grantMinted: 'people_grant_minted',
  grantRevoked: 'people_grant_revoked',
  seatClosed: 'people_seat_closed',
  siteAccessChanged: 'people_site_access_changed',
  bringForwardPicked: 'people_bring_forward_picked',
} as const;

/** One of the six chips (`DirectoryChip`), or the lens beside them. */
export interface DirectoryChipProperties {
  chip: string;
  /** 'mine' | 'studio' — which lens was live when the chip was pressed. */
  scope: string;
  /** The trade or specialty chip on the second line, when one is narrowing. */
  trade?: string | null;
}

export interface PersonCardOpenProperties {
  /** Where the card was opened FROM: 'directory_row' | 'seat_line' |
   *  'roster_row' | 'company_crew' | 'command_bar' | 'duplicate_band'. */
  source: string;
  /** How many seats sit beneath this identity — the number the v4 rebuild
   *  exists to make honest. */
  seat_count?: number | null;
}

export interface CompanyCardOpenProperties {
  source: string;
  /** The firm's paper word at open: the studio's reason for looking. */
  paper_state?: string | null;
}

export interface ConsentRecordedProperties {
  /** 'sms' | 'email'. */
  channel_kind: string;
  /** The status RECORDED, not the one displayed: 'pending' | 'granted' |
   *  'opted_out'. */
  status: string;
  /** 'verbal' | 'written' | 'web_form' | 'other'. */
  source: string;
  /** Where the act happened: 'add_sheet' | 'party_sheet' | 'person_card'. */
  surface: string;
  /** PR-m — true when this is the studio recording a refusal it HEARD, rather
   *  than one the recipient texted. */
  manual_opt_out?: boolean;
}

export interface GrantMintedProperties {
  /** An `AccessGrantTier`. */
  tier: string;
  /** PR-d/PR-l — which clock set the end date: 'engagement_window' |
   *  'warranty' | 'chosen' | 'fallback_90_day'. The fourth value is the one
   *  worth watching: it means a seat had no window to end with. */
  expiry_source?: string;
}

export interface GrantRevokedProperties {
  tier: string;
  /** True when a reason was written. Never the reason itself. */
  with_reason: boolean;
}

export interface SeatClosedProperties {
  /** The stage the seat was in when it closed. */
  from_stage?: string | null;
  /** True when a reason was written. Never the reason itself. */
  with_reason: boolean;
  /** True for the surviving hard delete — the mistaken add. Its rate is the
   *  measure of whether Close this seat actually replaced Remove. */
  hard_deleted?: boolean;
}

export interface SiteAccessChangedProperties {
  /** Which region moved: 'way_in' | 'key_holder' | 'hours' | 'receiving' |
   *  'emergency_lines' | 'told'. */
  region: string;
  /** How many seats were logged as told, on a 'told' change. */
  told_count?: number;
}

export interface BringForwardPickedProperties {
  /** How many rows travelled in one confirm. */
  picked_count: number;
  /** How many were offered. */
  offered_count: number;
  /** True when at least one picked row arrived carrying a refusal — the fact
   *  the travel list exists to carry forward (F-12). */
  carried_opt_out?: boolean;
}

export const peopleEvents = {
  /** A chip (or the trade line beneath it) narrowed the book. */
  directoryChip: (properties: DirectoryChipProperties) =>
    track(PEOPLE_EVENT_NAMES.directoryChip, properties),

  /** A person card opened — from a row, a seat line, or anywhere else. */
  personCardOpened: (properties: PersonCardOpenProperties) =>
    track(PEOPLE_EVENT_NAMES.personCardOpened, properties),

  /** A company card opened. */
  companyCardOpened: (properties: CompanyCardOpenProperties) =>
    track(PEOPLE_EVENT_NAMES.companyCardOpened, properties),

  /** A consent act LANDED on `studio_channel_consent` — fired on the
   *  mutation's success, never on the press. */
  consentRecorded: (properties: ConsentRecordedProperties) =>
    track(PEOPLE_EVENT_NAMES.consentRecorded, properties),

  /** A door opened. */
  grantMinted: (properties: GrantMintedProperties) =>
    track(PEOPLE_EVENT_NAMES.grantMinted, properties),

  /** A door closed. */
  grantRevoked: (properties: GrantRevokedProperties) =>
    track(PEOPLE_EVENT_NAMES.grantRevoked, properties),

  /** A seat closed with a date and a reason — or, rarely, was removed. */
  seatClosed: (properties: SeatClosedProperties) =>
    track(PEOPLE_EVENT_NAMES.seatClosed, properties),

  /** The way in changed, or somebody was told about it. */
  siteAccessChanged: (properties: SiteAccessChangedProperties) =>
    track(PEOPLE_EVENT_NAMES.siteAccessChanged, properties),

  /** A rolodex pick travelled onto a job (Leah task 5). */
  bringForwardPicked: (properties: BringForwardPickedProperties) =>
    track(PEOPLE_EVENT_NAMES.bringForwardPicked, properties),
};
