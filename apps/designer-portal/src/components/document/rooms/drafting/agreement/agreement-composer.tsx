"use client";

/**
 * The Contract Room, composed — the `agreement-parts` face of the drafting
 * room.
 *
 * An agreement stops being seven fixed facets and becomes an ordered list of
 * parts. The rail decides what is in it and in what order; the centre column
 * writes one part at a time; the right rail says what still needs attention
 * and shows the client's copy exactly as it will read.
 *
 * Persistence is deliberately coarse: every act mutates local state and marks
 * the composition dirty, and Save writes the WHOLE ordered array through
 * `upsert_agreement_parts`. The RPC replaces wholesale, so a removed part is
 * absent rather than blank, and there is no half-saved agreement.
 *
 * The money row is not written here. `proposal_service_terms` is the server's
 * projection of the schedule parts (R5); this component never touches it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useMaterializeStandardParts,
  useSaveAgreementParts,
} from "@patina/supabase";
import type { AgreementPart } from "@patina/types";
import { RoomShell } from "../../room-shell";
import { DocSheet } from "../../../overlays/doc-sheet";
import { DocumentAction } from "../../../document-action";
import { Button } from "@/components/ui/controls";
import { ClientPicker } from "@/components/portal/client-picker";
import { useAttachDocumentClient } from "@/hooks/use-attach-client";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-clients";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import { ServiceAgreementPreview } from "../../../commercial/service-agreement-preview";
import { ServiceAgreementSendSheet } from "../../../commercial/service-agreement-send-sheet";
import { clearRoomOrigin, readRoomOrigin } from "@/lib/document/room-origin";
import { createBlankPart } from "./part-kinds";
import { PartEditor } from "./part-editor";
import { PartsRail } from "./parts-rail";
import {
  assessAgreementReadiness,
  documentBlockers,
  partsNeedingAttention,
} from "./readiness";

const labelClass =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

function renumber(parts: AgreementPart[]): AgreementPart[] {
  return parts.map((part, index) => ({ ...part, position: index + 1 }));
}

export function AgreementComposer({
  proposal,
  bundle,
}: {
  proposal: any;
  bundle: CommercialDocumentBundle;
}) {
  const router = useRouter();
  const document: CommercialDocument = bundle.document;
  const proposalId = document.id;

  // R23 — one data layer. The parts hooks live in `@patina/supabase` with the
  // rest of the Supabase reads and writes; the portal kept a second copy of
  // them while the package and this room were built in parallel worktrees.
  // They hand back the saved rows, which is what this room reads, and they
  // invalidate `commercialKeys.all` — the prefix of this app's own document
  // bundle key (`commercialDocumentKeys.bundle` is ['commercial-documents',
  // id]) — so the bundle behind the preview refetches on every save without
  // this room asking it to.
  const save = useSaveAgreementParts(proposalId);
  const materialize = useMaterializeStandardParts(proposalId);
  const attachClient = useAttachDocumentClient();
  const { user, status: authStatus } = useAuth();
  const clients = useClients();
  const ownsProposal = user?.id === proposal.designer_id;
  const ownerClients = useMemo(
    () =>
      (clients.data ?? []).filter(
        (client: any) => client.designer_id === proposal.designer_id,
      ),
    [clients.data, proposal.designer_id],
  );

  const [parts, setParts] = useState<AgreementPart[]>(() =>
    renumber([...bundle.parts].sort((a, b) => a.position - b.position)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    bundle.parts[0]?.id ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [clientNote, setClientNote] = useState<string | null>(null);
  const [clientError, setClientError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const readOnly = document.state !== "draft";

  // Seed the nine standard parts from the terms row this agreement already
  // has. The ref is React 18 StrictMode's double-effect, not correctness —
  // `materialize_standard_parts` is idempotent server-side and a second call
  // writes nothing — but a duplicate round-trip on every mount is still a
  // round-trip nobody asked for.
  const materializeFired = useRef(false);
  useEffect(() => {
    if (materializeFired.current) return;
    if (readOnly) return;
    if (bundle.parts.length > 0) return;
    materializeFired.current = true;
    materialize.mutate(undefined, {
      onSuccess: (next) => {
        const seeded = renumber(
          [...next.parts].sort((a, b) => a.position - b.position),
        );
        setParts(seeded);
        setSelectedId((current) => current ?? seeded[0]?.id ?? null);
      },
      onError: (error) =>
        setSaveNote(
          error instanceof Error
            ? error.message
            : "The standard parts could not be opened.",
        ),
    });
    // The agreement id is the remount key upstream; re-running this on a
    // background refetch would re-ask a question already answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  const recipientEmail =
    typeof proposal.client?.email === "string" ? proposal.client.email : null;
  const recipientName =
    proposal.client?.full_name ?? proposal.client_name ?? undefined;

  const readiness = useMemo(
    () => assessAgreementReadiness({ document, parts, recipientEmail }),
    [document, parts, recipientEmail],
  );
  const blockedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const blocker of readiness.blockers) {
      if (blocker.partId) ids.add(blocker.partId);
    }
    return ids;
  }, [readiness]);
  const needAttention = partsNeedingAttention(readiness);

  const selected = parts.find((part) => part.id === selectedId) ?? null;

  const mutate = (next: AgreementPart[]) => {
    setParts(renumber(next));
    setDirty(true);
    setSaveNote(null);
  };

  const changePayload = (id: string, payload: Record<string, unknown>) =>
    mutate(parts.map((part) => (part.id === id ? { ...part, payload } : part)));

  const renamePart = (id: string, title: string) =>
    mutate(parts.map((part) => (part.id === id ? { ...part, title } : part)));

  const removePart = (id: string) => {
    const next = parts.filter((part) => part.id !== id);
    mutate(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const reorderPart = (from: number, to: number) => {
    if (to < 0 || to >= parts.length) return;
    const next = [...parts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    mutate(next);
  };

  const addPart = (input: {
    kind: AgreementPart["kind"];
    variant: AgreementPart["variant"];
  }) => {
    const blank = createBlankPart({
      proposalId,
      kind: input.kind,
      variant: input.variant,
      position: parts.length + 1,
    });
    mutate([...parts, blank]);
    setSelectedId(blank.id);
  };

  const persist = async () => {
    // `upsert_agreement_parts` is DELETE-then-INSERT and does not carry `id`
    // through, so every part comes back with a new uuid. `part_key` is the
    // identity that survives a save — matching on `id` re-selected nothing
    // and dropped the designer onto part one after every Save.
    const selectedKey = selected?.partKey ?? null;
    try {
      const next = await save.mutateAsync(parts);
      const saved = renumber(
        [...next.parts].sort((a, b) => a.position - b.position),
      );
      setParts(saved);
      setSelectedId(
        (selectedKey === null
          ? null
          : (saved.find((part) => part.partKey === selectedKey)?.id ?? null)) ??
          saved[0]?.id ??
          null,
      );
      setDirty(false);
      setSaveNote("All agreement changes saved.");
      return true;
    } catch (error) {
      setSaveNote(
        error instanceof Error
          ? error.message
          : "The agreement could not be saved.",
      );
      return false;
    }
  };

  const reviewAndSend = async () => {
    if (dirty && !(await persist())) return;
    setSendOpen(true);
  };

  const changeClient = (clientId: string | null) => {
    setClientNote(null);
    setClientError(false);
    if (!ownsProposal) {
      setClientError(true);
      setClientNote("Only the agreement owner can change the client account.");
      return;
    }
    attachClient.mutate(
      { engagementKind: "proposal", targetId: proposalId, clientId },
      {
        onSuccess: () => {
          setClientError(false);
          setClientNote(
            clientId
              ? "Client account attached to this agreement."
              : "Client account cleared.",
          );
        },
        onError: (error) => {
          setClientError(true);
          setClientNote(
            error instanceof Error
              ? error.message
              : "The client account could not be attached.",
          );
        },
      },
    );
  };

  const previewProps = {
    document,
    terms: bundle.terms ?? emptyProjection(proposalId),
    rates: bundle.rates,
    signatures: bundle.signatures,
    clientName: recipientName,
    parts,
  };

  return (
    <RoomShell
      title="The Contract Room · Design Agreement"
      count={`${needAttention} of ${parts.length} parts need attention`}
      action={
        <DocumentAction
          actionKey="review-design-agreement"
          variant="primary"
          trailing="→"
          onClick={() => void reviewAndSend()}
        >
          Review &amp; send
        </DocumentAction>
      }
    >
      <div className="mx-auto max-w-[1240px] px-6 py-7 sm:px-8">
        <header className="border-b border-[var(--doc-ink-border)] pb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-clay-ink)]">
            Yes to the designer · professional services only
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-[1.65rem] text-[var(--color-charcoal)]">
                {document.title}
              </h1>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
                Compose the parts this agreement is made of. Furnishings and
                purchasing stay outside it.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                Preview client copy
              </Button>
              <Button
                onClick={() => void persist()}
                loading={save.isPending}
                disabled={!dirty || readOnly}
              >
                {dirty ? "Save agreement" : "Saved"}
              </Button>
            </div>
          </div>
          <div className="mt-4 max-w-sm">
            <p className={labelClass}>Client account</p>
            <ClientPicker
              className="mt-2"
              value={
                typeof proposal.client_id === "string"
                  ? proposal.client_id
                  : null
              }
              onChange={changeClient}
              disabled={
                attachClient.isPending ||
                authStatus === "loading" ||
                !ownsProposal
              }
              clientOptions={ownerClients}
              ariaLabel="Client account"
              requireClientLogin
              placeholder="Select or invite a client…"
            />
            {!ownsProposal && authStatus !== "loading" && !clientNote && (
              <p className="mt-2 text-[11px] text-[var(--color-mocha)]">
                Only the agreement owner can change the client account.
              </p>
            )}
            {clientNote && (
              <p
                role={clientError ? "alert" : "status"}
                className="mt-2 text-[11px] text-[var(--color-mocha)]"
              >
                {clientNote}
              </p>
            )}
          </div>
          {saveNote && (
            <p
              role="status"
              className="mt-2 text-[11px] text-[var(--color-mocha)]"
            >
              {saveNote}
            </p>
          )}
          {readOnly && (
            <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
              This agreement has left the studio. Its parts are fixed as sent.
            </p>
          )}
        </header>

        <div className="grid gap-9 pt-7 min-[1180px]:grid-cols-[260px_minmax(0,1fr)_320px]">
          <PartsRail
            parts={parts}
            selectedId={selectedId}
            blockedIds={blockedIds}
            onSelect={setSelectedId}
            onReorder={reorderPart}
            onRename={renamePart}
            onRemove={removePart}
            onAdd={addPart}
            readOnly={readOnly}
          />

          <div>
            {selected ? (
              <PartEditor
                key={selected.id}
                part={selected}
                onChange={(payload) => changePayload(selected.id, payload)}
                readOnly={readOnly}
              />
            ) : (
              <p className="text-[12.5px] italic text-[var(--text-muted)]">
                Pick a part on the left, or add one.
              </p>
            )}
          </div>

          <aside className="space-y-6">
            <ReadinessPanel
              needAttention={needAttention}
              total={parts.length}
              documentBlockers={documentBlockers(readiness).map(
                (blocker) => blocker.message,
              )}
              notes={readiness.notes}
            />
            <div className="hidden min-[1180px]:block">
              <div className="sticky top-[82px] rounded-[8px] border border-[var(--doc-ink-border)] bg-white px-5 py-5">
                <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                  The client&apos;s copy · live
                </p>
                <ServiceAgreementPreview {...previewProps} compact />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <DocSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Client copy preview"
      >
        <ServiceAgreementPreview {...previewProps} />
      </DocSheet>

      <ServiceAgreementSendSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={() => {
          const destination = readRoomOrigin();
          clearRoomOrigin();
          router.push(destination);
        }}
        document={document}
        terms={bundle.terms}
        rates={bundle.rates}
        recipientEmail={recipientEmail}
        recipientName={recipientName}
        readinessOverride={{
          ready: readiness.ready,
          blockers: readiness.blockers.map((blocker) => blocker.message),
          notes: readiness.notes,
        }}
      />
    </RoomShell>
  );
}

function ReadinessPanel({
  needAttention,
  total,
  documentBlockers: docBlockers,
  notes,
}: {
  needAttention: number;
  total: number;
  documentBlockers: string[];
  notes: string[];
}) {
  return (
    <section
      aria-label="Agreement readiness"
      className="border-t border-[var(--doc-ink-border)] pt-4"
    >
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        {needAttention} of {total} parts need attention
      </p>
      {docBlockers.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-[var(--color-mocha)]">
          {docBlockers.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[11.5px] italic leading-relaxed text-[var(--text-muted)]">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The preview needs a terms shape for its Core (title, version, currency).
 *  A brand-new draft has no terms row yet; this is the empty projection, not
 *  a set of defaults anyone wrote — under parts the body comes from `parts`
 *  and none of these figures reach the page. */
function emptyProjection(proposalId: string) {
  return {
    proposalId,
    scope: "",
    deliverables: [],
    exclusions: [],
    billingCeilingCents: null,
    retainerAmountCents: 0,
    retainerActivationPolicy: "immediate" as const,
    billingCadence: "monthly" as const,
    currency: "USD",
    terms: "",
    currentRateVersion: 1,
    updatedAt: null,
    furnishingsDepositPercent: null,
  };
}
