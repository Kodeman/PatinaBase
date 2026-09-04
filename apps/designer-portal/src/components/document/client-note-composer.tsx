"use client";

/**
 * "Write to your client" (spec §6, Lane 6) — a project document's one
 * instrument for a studio member to leave a note that stands on the
 * client's page until she answers. Shape copied from margin-rail.tsx's
 * note composer (collapsed DocumentAction → textarea → DocumentActionRow);
 * scored ink, no shadows, no "AI" — VISION §6.
 *
 * Self-sufficient (ruling 2026-09-04): the composer fetches its own open
 * proposals / trade scopes / invoices from EXISTING hooks rather than
 * taking them as props, so page.tsx's mount stays projectId +
 * clientFirstName only. No new hook was added to @patina/supabase (Lane 1
 * owns that package).
 *
 * Proposal source (review fix 2026-09-04, finding 1): `proposals.project_id`
 * is NULL for every furnishings authorization / service addendum minted
 * since 00412+ — they bind through `project_commercial_documents` instead
 * (apps/client-portal/src/components/making/the-making.tsx:561-567 states
 * this explicitly for the client side). So furnishings authorizations come
 * from `useProjectInstruments` (RPC `list_furnishings_authorizations`,
 * which already resolves through the project binding — the same source
 * `authorizations-ledger.tsx` uses) rather than `useProposals`. Only
 * `design_services` agreements still set `project_id` directly (00414), so
 * those alone are read via `useProposals({ projectId })`, filtered to
 * `document_kind === 'design_services'` so a furnishings row that happens to
 * carry a legacy `project_id` is never double-counted.
 *
 * Gated on the `threshold` flag (fail-closed: renders nothing while loading
 * or off, and while `useProjectNotes` is still loading — a second standing
 * note is possible once one exists, since 00565's guard is a partial index,
 * not a uniqueness constraint, so this composer must never guess "no note
 * yet" from an unresolved query). Every hook below runs unconditionally
 * above every early return so hook order never depends on their resolved
 * values.
 */

import { useEffect, useMemo, useState } from "react";
import {
  useProjectNotes,
  useSendProjectNote,
  useRetireProjectNote,
  useProposals,
  useProjectInvoices,
  type ProjectNote,
  type ProjectNoteEnclosure,
  type Proposal,
  type Invoice,
} from "@patina/supabase";
import {
  useProjectInstruments,
  useTradeScopes,
} from "@/hooks/use-commercial-documents";
import type {
  ProjectInstrumentView,
  TradeScopeView,
} from "@/lib/document/project-commerce";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { fmtDay } from "@/lib/document/format";
import { DocumentAction, DocumentActionRow } from "./document-action";

/** Byte-identical to margin-rail.tsx's `DOCUMENT_WRITE_EVENT` — the doc
 *  page's zone-flight guard listens for this name. Kept as a local literal
 *  rather than importing margin-rail.tsx (a large module) into this leaf
 *  component and its test just for one string constant. */
const CLIENT_NOTE_WRITE_EVENT = "document:write";

const MAX_BODY_LENGTH = 2000;
/** 00565's `project_note_enclosures_ok` CHECK: `jsonb_array_length <= 6`. */
const MAX_ENCLOSURES = 6;

interface EnclosureOption {
  id: string;
  title: string;
}

/** Open furnishings authorizations: `state === 'sent'` IS the client
 *  signature gate here — unlike a design services agreement, an
 *  authorization has no `client_signed` interim state (project-commerce.ts
 *  ProjectInstrumentState docstring). Label is instrument-shaped per §6
 *  ("authorization No. 7"), not the raw title. */
function openAuthorizationOptions(
  instruments: ProjectInstrumentView[] | undefined,
): EnclosureOption[] {
  return (instruments ?? [])
    .filter((i) => i.state === "sent")
    .map((i) => ({ id: i.proposalId, title: `authorization No. ${i.number}` }));
}

/** Open design services agreements: the ONLY proposal kind still readable
 *  through `proposals.project_id` directly (00414). Mirrors the client's
 *  signature-gate notion (`the-making.tsx` `partitionProposals`): a raw
 *  `status` of 'sent' or 'viewed' both read as "sent" once normalized
 *  (`legacyStatusToCommercialState`), and `commercial_state` — once
 *  present — is the state of record and must be 'sent' (excludes
 *  'client_signed': the client already acted; 'executed'; 'declined';
 *  'superseded'). */
function normalizedProposalState(p: Proposal): string {
  if (p.commercial_state) return p.commercial_state;
  switch (p.status) {
    case "sent":
    case "viewed":
      return "sent";
    case "accepted":
      return "executed";
    case "declined":
      return "declined";
    case "revised":
      return "superseded";
    default:
      return "draft";
  }
}

function openDesignServicesOptions(
  proposals: Proposal[] | undefined,
): EnclosureOption[] {
  return (proposals ?? [])
    .filter(
      (p) =>
        p.document_kind === "design_services" &&
        normalizedProposalState(p) === "sent",
    )
    .map((p) => ({ id: p.id, title: "the design services agreement" }));
}

/** Open trade scopes: the id is the scope's underlying `proposals` row id —
 *  the same identity space `kind: 'proposal'` enclosures use — since a
 *  trade scope IS a proposal row (document_kind service_addendum). Label
 *  prefers the designer's own title (spec's own example, "the paintwork
 *  scope"); a scope left at the generic RPC default ("Trade scope") gets
 *  the instrument-shaped ordinal instead, so the sentence never doubles up
 *  ("Send it with the Trade scope"). */
function openTradeScopeOptions(
  scopes: TradeScopeView[] | undefined,
): EnclosureOption[] {
  return (scopes ?? [])
    .filter((t) => t.progressState === "substantially_complete")
    .map((t) => ({
      id: t.proposalId,
      title:
        t.title === "Trade scope" ? `trade scope No. ${t.number}` : t.title,
    }));
}

/** Open invoices: sent or partially paid. */
function openInvoiceOptions(
  invoices: Invoice[] | undefined,
): EnclosureOption[] {
  return (invoices ?? [])
    .filter((inv) => inv.status === "sent" || inv.status === "partially_paid")
    .map((inv) => ({
      id: inv.id,
      title: inv.invoice_number
        ? `invoice No. ${inv.invoice_number}`
        : "the invoice",
    }));
}

export interface ClientNoteComposerProps {
  projectId: string;
  clientFirstName: string | null | undefined;
}

/** Proposals (authorizations + design services) first, then trade scopes,
 *  capped at MAX_ENCLOSURES — the DB CHECK's own order of preference; an
 *  invoice is never pre-ticked (offered only). */
function defaultTickedKeys(
  openProposals: EnclosureOption[],
  openTradeScopes: EnclosureOption[],
): Set<string> {
  const keys = [
    ...openProposals.map((p) => `proposal:${p.id}`),
    ...openTradeScopes.map((t) => `trade_scope:${t.id}`),
  ];
  return new Set(keys.slice(0, MAX_ENCLOSURES));
}

function tickedToEnclosures(ticked: Set<string>): ProjectNoteEnclosure[] {
  return Array.from(ticked).map((key) => {
    const [kind, id] = key.split(":") as [ProjectNoteEnclosure["kind"], string];
    return { kind, id };
  });
}

/** A Postgres RLS refusal on INSERT surfaces as SQLSTATE 42501
 *  (insufficient_privilege) through PostgREST. Anything else — a network
 *  failure, a CHECK violation that slipped past the client-side cap, a
 *  5xx — reads as the generic retry sentence. */
function sendErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  return code === "42501"
    ? "This project isn't yours to write to."
    : "That didn't send. Try again in a moment.";
}

export function ClientNoteComposer({
  projectId,
  clientFirstName,
}: ClientNoteComposerProps) {
  const flag = useFeatureFlag("threshold");
  const { data: notes, isLoading: notesLoading } = useProjectNotes(projectId);
  const notesReady = !flag.isLoading && flag.value;
  const { data: authorizationRows } = useProjectInstruments(
    projectId,
    notesReady,
  );
  // useProposals has no `enabled` override (packages/supabase/src/hooks/
  // use-proposals.ts — outside this fix's pathspec), so it always fires;
  // its result is only ever read once `notesReady` is true.
  const { data: designServicesRows } = useProposals({ projectId });
  const { data: tradeScopeRows } = useTradeScopes(projectId, notesReady);
  const { data: invoiceRows } = useProjectInvoices(projectId);
  const sendNote = useSendProjectNote();
  const retireNote = useRetireProjectNote();

  const openProposals = useMemo(
    () => [
      ...openAuthorizationOptions(authorizationRows),
      ...openDesignServicesOptions(designServicesRows),
    ],
    [authorizationRows, designServicesRows],
  );
  const openTradeScopes = useMemo(
    () => openTradeScopeOptions(tradeScopeRows),
    [tradeScopeRows],
  );
  const openInvoices = useMemo(
    () => openInvoiceOptions(invoiceRows),
    [invoiceRows],
  );

  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [ticksTouched, setTicksTouched] = useState(false);
  const [retiredReceipt, setRetiredReceipt] = useState<string | null>(null);
  // The id of the note this session itself retired — held past the retire
  // call so a `standingNote` that is still the pre-invalidation value from
  // a stale cache read (the query hasn't refetched yet) is never mistaken
  // for a live one and offered "Take it down" a second time (finding 3).
  const [retiredNoteId, setRetiredNoteId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Re-sync the pre-tick to whatever the open lists resolve to, for as
  // long as the designer hasn't touched a checkbox herself — a composer
  // opened before these queries land must not freeze on an empty default
  // (finding 12).
  useEffect(() => {
    if (!composing || ticksTouched) return;
    setTicked(defaultTickedKeys(openProposals, openTradeScopes));
  }, [composing, ticksTouched, openProposals, openTradeScopes]);

  if (flag.isLoading || !flag.value || notesLoading) return null;

  const standingNoteRaw: ProjectNote | undefined = (notes ?? []).find(
    (n) => n.state === "standing",
  );
  const standingNote =
    standingNoteRaw && standingNoteRaw.id !== retiredNoteId
      ? standingNoteRaw
      : undefined;

  const openComposer = () => {
    setRetiredReceipt(null);
    setTicksTouched(false);
    setTicked(defaultTickedKeys(openProposals, openTradeScopes));
    setBody("");
    setSendError(null);
    setComposing(true);
  };

  const closeComposer = () => {
    setComposing(false);
    setBody("");
    setTicksTouched(false);
    setTicked(new Set());
    setSendError(null);
  };

  const send = () => {
    if (!body.trim() || body.length > MAX_BODY_LENGTH) return;
    setSendError(null);
    sendNote.mutate(
      {
        projectId,
        body: body.trim(),
        enclosures: tickedToEnclosures(ticked),
      },
      {
        onSuccess: () => {
          closeComposer();
          window.dispatchEvent(new CustomEvent(CLIENT_NOTE_WRITE_EVENT));
        },
        onError: (error) => setSendError(sendErrorMessage(error)),
      },
    );
  };

  const retire = () => {
    if (!standingNote || retireNote.isPending) return;
    const noteId = standingNote.id;
    retireNote.mutate(
      { noteId, projectId },
      {
        onSuccess: () => {
          setRetiredNoteId(noteId);
          setRetiredReceipt(
            `Taken down ${fmtDay(new Date().toISOString())}. It moves to Previously.`,
          );
        },
      },
    );
  };

  const toggleTick = (key: string) => {
    setTicksTouched(true);
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < MAX_ENCLOSURES) {
        next.add(key);
      }
      return next;
    });
  };

  // The retired receipt is local, optimistic state and takes precedence
  // over a `standingNote` that may still be sitting in a stale cache until
  // the invalidated query refetches — otherwise a second click could retire
  // the same note twice (finding 3).
  if (retiredReceipt) {
    return (
      <div className="mt-2">
        <p
          role="status"
          className="text-[11px] italic text-[var(--text-muted)]"
        >
          {retiredReceipt}
        </p>
        <DocumentAction
          actionKey="open-client-note-composer"
          surfaceKey="open-document"
          regionKey="client-note"
          variant="secondary"
          className="mt-1.5"
          onClick={openComposer}
        >
          Write to your client
        </DocumentAction>
      </div>
    );
  }

  if (standingNote) {
    return (
      <div className="mt-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-2.5">
        <p className="text-[13px] leading-relaxed text-[var(--color-charcoal)]">
          {standingNote.body}
        </p>
        <p
          role="status"
          className="mt-1 text-[11px] italic text-[var(--text-muted)]"
        >
          Sent {fmtDay(standingNote.sentAt)}. It stands on her page until she
          answers.
        </p>
        <DocumentActionRow
          surfaceKey="open-document"
          regionKey="client-note"
          className="mt-1.5"
          aria-label="Client note actions"
        >
          <DocumentAction
            actionKey="retire-client-note"
            variant="tertiary"
            disabled={retireNote.isPending}
            loading={retireNote.isPending}
            loadingLabel="Taking down…"
            onClick={retire}
          >
            Take it down
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }

  if (!composing) {
    return (
      <DocumentAction
        actionKey="open-client-note-composer"
        surfaceKey="open-document"
        regionKey="client-note"
        variant="secondary"
        className="mt-2"
        onClick={openComposer}
      >
        Write to your client
      </DocumentAction>
    );
  }

  const label = clientFirstName
    ? `A line to ${clientFirstName}`
    : "A line to your client";
  const atCap = ticked.size >= MAX_ENCLOSURES;
  const disabled =
    !body.trim() || body.length > MAX_BODY_LENGTH || sendNote.isPending;

  return (
    <div className="mt-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-2.5">
      <label
        htmlFor="client-note-body"
        className="mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
      >
        {label}
      </label>
      <textarea
        id="client-note-body"
        autoFocus
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Three last pieces for the library — sign and I'll have them ordered by Friday."
        className="w-full resize-y bg-transparent text-[12px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
      />
      <p className="mt-0.5 text-right font-mono text-[10px] text-[var(--text-muted)]">
        {body.length} / {MAX_BODY_LENGTH}
      </p>
      {(openProposals.length > 0 ||
        openTradeScopes.length > 0 ||
        openInvoices.length > 0) && (
        <div className="mt-1.5 flex flex-col gap-1">
          {openProposals.map((p) => {
            const key = `proposal:${p.id}`;
            const checked = ticked.has(key);
            return (
              <label
                key={key}
                className="flex cursor-pointer items-baseline gap-2 text-[11px] text-[var(--color-charcoal)]"
              >
                <input
                  type="checkbox"
                  className="relative top-[1px] accent-[var(--color-clay)]"
                  checked={checked}
                  disabled={!checked && atCap}
                  onChange={() => toggleTick(key)}
                />
                Send it with {p.title}
              </label>
            );
          })}
          {openTradeScopes.map((t) => {
            const key = `trade_scope:${t.id}`;
            const checked = ticked.has(key);
            return (
              <label
                key={key}
                className="flex cursor-pointer items-baseline gap-2 text-[11px] text-[var(--color-charcoal)]"
              >
                <input
                  type="checkbox"
                  className="relative top-[1px] accent-[var(--color-clay)]"
                  checked={checked}
                  disabled={!checked && atCap}
                  onChange={() => toggleTick(key)}
                />
                Send it with the {t.title}
              </label>
            );
          })}
          {openInvoices.map((inv) => {
            const key = `invoice:${inv.id}`;
            const checked = ticked.has(key);
            return (
              <label
                key={key}
                className="flex cursor-pointer items-baseline gap-2 text-[11px] text-[var(--color-charcoal)]"
              >
                <input
                  type="checkbox"
                  className="relative top-[1px] accent-[var(--color-clay)]"
                  checked={checked}
                  disabled={!checked && atCap}
                  onChange={() => toggleTick(key)}
                />
                Send it with {inv.title}
              </label>
            );
          })}
          {atCap && (
            <p className="text-[11px] italic text-[var(--text-muted)]">
              Six enclosures is the most a note carries.
            </p>
          )}
        </div>
      )}
      <p className="mt-1.5 text-[11px] italic text-[var(--text-muted)]">
        She reads this on her page. Nothing is emailed.
      </p>
      {sendError && (
        <p
          role="alert"
          className="mt-1 text-[11px] text-[var(--color-terracotta-ink)]"
        >
          {sendError}
        </p>
      )}
      <DocumentActionRow
        surfaceKey="open-document"
        regionKey="client-note"
        className="mt-1.5"
        aria-label="Client note actions"
      >
        <DocumentAction
          actionKey="send-client-note"
          variant="primary"
          disabled={disabled}
          loading={sendNote.isPending}
          loadingLabel="Sending…"
          onClick={send}
        >
          Send
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-client-note"
          variant="tertiary"
          onClick={closeComposer}
        >
          Never mind
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}
