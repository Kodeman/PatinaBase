"use client";

/**
 * MINT A PAPERWORK LINK — the firm's own door onto its paper (PR-a, VISION
 * V10, upload-door-spec §2).
 *
 * R-AD IS THE WHOLE BAND. "A firm with no active engagement may still be
 * minted a paperwork link; the studio chooses the end date, offered as 30 days
 * or the firm's next engagement window, IN WORDS on the mint act. No silent
 * fallback clock."
 *
 * So the end date is never assumed. Where the firm is working, the band names
 * the day its work here ends and offers that; where it is not — a bidder, or a
 * firm between jobs — there is nothing to borrow from and the studio says the
 * day out loud. `mint_paperwork_link` refuses outright rather than inventing
 * one (`paperwork_link_window_required`), and that refusal reaches this face
 * as a sentence.
 *
 * R-AF: one live door per firm. The RPC revokes the standing one on the way,
 * and this band says so BEFORE the press rather than after.
 *
 * THE ADDRESS EXISTS ONCE. `paperwork_link_tokens` stores sha256; nothing in
 * Patina can re-emit the raw value, so the band prints it and says it will not
 * print it again.
 */

import { useState } from "react";
import {
  paperworkLinkUrl,
  thirtyDaysOut,
  useMintPaperworkLink,
  usePaperworkLinks,
} from "@patina/supabase";
import { peopleEvents } from "@/lib/analytics/people-events";
import { DocumentAction, DocumentActionRow } from "../document-action";
import { formatLongDate, lastOpenDay } from "./people-format";

const LABEL =
  "font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-subtle)]";
const FIELD =
  "min-h-11 w-full border-0 border-b border-[var(--hairline-strong)] bg-transparent py-2 text-[0.8rem] text-[var(--ink)] outline-none focus:border-[var(--color-clay)]";

/** Which clock the studio chose. `window` is the firm's own engagement end. */
export type PaperworkWindowChoice = "window" | "thirty" | "named";

export const NO_ENGAGEMENT_SENTENCE =
  "This firm has no open engagement here, so the day the door closes is yours to choose.";

export function paperworkWindowSentence(windowEnd: string | null): string {
  const date = formatLongDate(windowEnd);
  return date
    ? `The door can end with this firm's work here, ${date}.`
    : NO_ENGAGEMENT_SENTENCE;
}

export function paperworkReplaceSentence(firmName: string): string {
  return `${firmName} already holds a live paperwork link. Opening a new one closes it.`;
}

/**
 * THE SAME DAY THE BAND OFFERED (W4 r3 MAJOR-1).
 *
 * `expires_at` is stored as an EXCLUSIVE boundary, so slicing its date
 * component printed the day AFTER the one the studio chose: the band offered
 * "Ends with the job — 8 February 2027", she pressed Open the door, and this
 * sentence — and the durable Access grants row beside it — answered "9
 * February 2027". Two disagreeing dates for one door, with nothing on the face
 * to say which was right. `lastOpenDay` is the one reckoning both now read.
 */
export function paperworkMintedSentence(
  firmName: string,
  expiresAt: string | null,
): string {
  const date = formatLongDate(expiresAt ? lastOpenDay(expiresAt) : null);
  return date
    ? `This address is shown once. ${firmName} can send their paper here until ${date}.`
    : `This address is shown once. ${firmName} can send their paper here.`;
}

export function PaperworkLinkAct({
  companyId,
  firmName,
  /** The latest `on_site_to` / `warranty_until` across the firm's open seats at
   *  this studio — the date `mint_paperwork_link` derives when none is named. */
  windowEnd,
  onAnnounce,
  now = new Date(),
}: {
  companyId: string;
  firmName: string;
  windowEnd: string | null;
  onAnnounce: (message: string) => void;
  now?: Date;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PaperworkWindowChoice>(
    windowEnd ? "window" : "thirty",
  );
  const [namedDay, setNamedDay] = useState("");
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [mintedNote, setMintedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mint = useMintPaperworkLink();
  const { data: links } = usePaperworkLinks(companyId);

  const bandId = `paperwork-link-${companyId}`;
  const thirty = thirtyDaysOut(now);
  const live = (links ?? []).find(
    (link) => link.status === "active" && Date.parse(link.expires_at) > now.getTime(),
  );

  /**
   * R-AD — what the studio named, sent as a whole-day end. EVERY BRANCH NAMES
   * ITS DAY, including "ends with the job" (W4 r3 MAJOR-4).
   *
   * This branch used to send NULL and let `mint_paperwork_link` re-derive the
   * window. The RPC's derivation carries a third predicate this face cannot
   * (`project_tenant_org(pp.project_id) = v_org`, 00637:459-463), while
   * `people_directory_seats` admits seats on projects with `studio_id IS NULL`
   * through its designer-of-record legs (R-BD / R-BI's legacy population). So
   * the band could print "The door can end with this firm's work here, <date>",
   * pre-select that radio, and meet `paperwork_link_window_required` — whose
   * own sentence ("This firm has no open engagement here") contradicts the
   * line directly above it.
   *
   * Sending the day the face actually showed closes both halves at once: the
   * RPC never re-derives, so the two reckonings cannot diverge, and the stored
   * `expires_at` is the chosen day's own end rather than an exclusive midnight
   * the post-mint sentence then had to guess its way back from.
   */
  const chosenDay =
    choice === "window"
      ? windowEnd
      : choice === "thirty"
        ? thirty
        : namedDay.trim();
  const namedDayMissing = choice === "named" && !chosenDay;

  const openTheDoor = () => {
    setError(null);
    void mint
      .mutateAsync({
        companyId,
        expiresAt: chosenDay ? `${chosenDay}T23:59:59Z` : null,
      })
      .then((minted) => {
        // The raw address exists once (00637). Print it, say so, and offer the
        // copy — Patina holds only sha256 from here.
        setMintedUrl(paperworkLinkUrl(minted.token));
        setMintedNote(paperworkMintedSentence(firmName, minted.expires_at));
        peopleEvents.grantMinted({
          tier: "paperwork_link",
          expiry_source: choice === "window" ? "engagement_window" : "chosen",
        });
        setOpen(false);
        onAnnounce(`A paperwork link for ${firmName} is open.`);
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "Could not open that door just now.",
        ),
      );
  };

  const copy = async () => {
    if (!mintedUrl) return;
    try {
      await navigator.clipboard?.writeText(mintedUrl);
      onAnnounce("The paperwork address is copied.");
    } catch {
      // A clipboard the browser refuses is not a failed mint: the address is
      // on the page and can be selected by hand.
      setError("Could not reach the clipboard — the address is above.");
    }
  };

  return (
    <div data-paperwork-link-act={companyId}>
      <DocumentAction
        actionKey="mint-paperwork-link"
        surfaceKey="people"
        regionKey="company-paper"
        variant="tertiary"
        aria-expanded={open}
        aria-controls={bandId}
        onClick={() => {
          setError(null);
          setOpen((o) => !o);
        }}
      >
        Mint a paperwork link
      </DocumentAction>

      <div id={bandId} hidden={!open} className="mt-2">
        {open && (
          <div className="border-l-2 border-[var(--color-clay)] bg-[var(--rail)] px-3 py-2.5">
            {/* R-AD's sentence, in words, before the choice. */}
            <p data-paperwork-window-sentence className="t-body-sm text-[var(--ink)]">
              – {paperworkWindowSentence(windowEnd)}
            </p>
            {live && (
              <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
                {paperworkReplaceSentence(firmName)}
              </p>
            )}

            <fieldset className="mt-2 border-0 p-0">
              <legend className={LABEL}>When the door closes</legend>
              {windowEnd && (
                <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
                  <input
                    type="radio"
                    name={`${bandId}-choice`}
                    checked={choice === "window"}
                    onChange={() => setChoice("window")}
                  />
                  {`Ends with the job — ${formatLongDate(windowEnd)}`}
                </label>
              )}
              <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
                <input
                  type="radio"
                  name={`${bandId}-choice`}
                  checked={choice === "thirty"}
                  onChange={() => setChoice("thirty")}
                />
                {`Thirty days — ${formatLongDate(thirty)}`}
              </label>
              <label className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]">
                <input
                  type="radio"
                  name={`${bandId}-choice`}
                  checked={choice === "named"}
                  onChange={() => setChoice("named")}
                />
                Their next window — a day I name
              </label>
            </fieldset>

            {choice === "named" && (
              <>
                <label className={`mt-2 block ${LABEL}`} htmlFor={`${bandId}-day`}>
                  The day it closes
                </label>
                <input
                  id={`${bandId}-day`}
                  type="date"
                  value={namedDay}
                  onChange={(e) => setNamedDay(e.target.value)}
                  className={FIELD}
                />
              </>
            )}

            <DocumentActionRow
              surfaceKey="people"
              regionKey="company-paper-paperwork-link"
              className="mt-2"
              aria-label={`Open a paperwork link for ${firmName}`}
            >
              <DocumentAction
                actionKey="open-paperwork-link"
                variant="primary"
                held={namedDayMissing}
                disabled={namedDayMissing}
                aria-describedby={
                  namedDayMissing ? `${bandId}-held` : undefined
                }
                loading={mint.isPending}
                loadingLabel="Opening…"
                onClick={openTheDoor}
              >
                Open the door
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-paperwork-link"
                variant="tertiary"
                onClick={() => setOpen(false)}
              >
                Not now
              </DocumentAction>
            </DocumentActionRow>
            {namedDayMissing && (
              <p
                id={`${bandId}-held`}
                className="t-body-sm mt-1 text-[var(--ink-subtle)]"
              >
                Name the day it closes. There is no clock to fall back on.
              </p>
            )}
          </div>
        )}
      </div>

      {mintedUrl && (
        <div className="mt-2">
          <p
            data-paperwork-address
            className="t-body-sm break-all font-mono text-[var(--ink)]"
          >
            {mintedUrl}
          </p>
          {mintedNote && (
            <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">{mintedNote}</p>
          )}
          <DocumentAction
            actionKey="copy-paperwork-link"
            surfaceKey="people"
            regionKey="company-paper"
            variant="tertiary"
            onClick={() => void copy()}
          >
            Copy the address
          </DocumentAction>
        </div>
      )}

      {error && (
        <p
          role="alert"
          data-paperwork-error
          className="t-body-sm mt-1 text-[var(--terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
