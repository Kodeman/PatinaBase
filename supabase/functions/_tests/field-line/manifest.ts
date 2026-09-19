import { conditionReport, poDelivery } from "./cases/condition-po-delivery.ts";
import { duplicateTwilioSid } from "./cases/duplicate-twilio-sid.ts";
import { dstQuietHours } from "./cases/dst-quiet-hours.ts";
import { interruptedMediaUpload } from "./cases/interrupted-media-upload.ts";
import { oldRefReply } from "./cases/old-ref-reply.ts";
import { providerFailureWithCode } from "./cases/provider-failure-with-code.ts";
import { replyToRenew } from "./cases/reply-to-renew.ts";
import { budgetFoldToDigest } from "./cases/budget-fold-to-digest.ts";
import { deadEndHandoff } from "./cases/dead-end-handoff.ts";
import { siteCardDayOf } from "./cases/site-card-day-of.ts";
import { rpcFailureMidEffect } from "./cases/rpc-failure-mid-effect.ts";
import { staleForwardedLink } from "./cases/stale-forwarded-link.ts";
import { startNoConsent } from "./cases/start-no-consent.ts";
import { stopThenNewEngagement } from "./cases/stop-then-new-engagement.ts";
import { twoStudiosOnePhone } from "./cases/two-studios-one-phone.ts";
import { unknownSenderWrong } from "./cases/unknown-sender-wrong.ts";
import type { GateCase } from "./types.ts";

/** The complete evidence inventory. Do not remove a blocked case: strict mode
 * turns a due skip into a gate failure after its owner has landed. */
export const fieldLineCases: GateCase[] = [
  twoStudiosOnePhone,
  stopThenNewEngagement,
  startNoConsent,
  duplicateTwilioSid,
  rpcFailureMidEffect,
  providerFailureWithCode,
  staleForwardedLink,
  dstQuietHours,
  unknownSenderWrong,
  oldRefReply,
  conditionReport,
  poDelivery,
  interruptedMediaUpload,
  // The trade rail (00645): renewing a lapsed link, the daily cadence, the dead
  // end that has an owner, and the two cards a crew actually acts on.
  replyToRenew,
  budgetFoldToDigest,
  deadEndHandoff,
  siteCardDayOf,
];

export { type GateAssertion, type GateCase } from "./types.ts";
