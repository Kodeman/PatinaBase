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
  useAgreementDraws,
  useAgreementJurisdictionNotices,
  useAgreementParts,
  useDiscardAgreementParts,
  useMaterializeAgreementTemplate,
  useMaterializeStandardParts,
  useAgreementStudioContext,
  useSaveAgreementPart,
  useSaveAgreementParts,
  useStudioLicenseAttestation,
  licenseAttestationIsLive,
} from "@patina/supabase";
import {
  AGREEMENT_PART_COPY,
  type AgreementPart,
  type AgreementTemplate,
} from "@patina/types";
import { RoomShell } from "../../room-shell";
import { DocSheet } from "../../../overlays/doc-sheet";
import { DocumentAction } from "../../../document-action";
import { Button } from "@/components/ui/controls";
import { ClientPicker } from "@/components/portal/client-picker";
import { useAttachDocumentClient } from "@/hooks/use-attach-client";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-clients";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { documentEvents } from "@/lib/analytics/document-events";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import { ServiceAgreementPreview } from "../../../commercial/service-agreement-preview";
import { ServiceAgreementSendSheet } from "../../../commercial/service-agreement-send-sheet";
import { clearRoomOrigin, readRoomOrigin } from "@/lib/document/room-origin";
import {
  createBlankPart,
  duplicateMoneyVariants,
  localPartId,
  unnamedRateCardRoles,
} from "./part-kinds";
import { PartEditor } from "./part-editor";
import { PartsRail } from "./parts-rail";
import { AddPartSheet, type AddPartChoice } from "./add-part-sheet";
import { TemplatePickerSheet } from "./template-picker-sheet";
import { SaveAsTemplateAction } from "./save-as-template-action";
import { PartHistoryStrip } from "./part-history-strip";
import {
  assessAgreementReadiness,
  BLANK_ROLE_BLOCKER,
  blockersForPart,
  documentBlockers,
  duplicateMoneyBlocker,
  partsNeedingAttention,
} from "./readiness";
import {
  DrawLedger,
  JurisdictionAttachments,
  LienWaiverAttachments,
  TURNKEY_PART_KEYS,
  type TurnkeyContext,
} from "./turnkey";
import { TradeAgreementsStrip } from "../../../commercial/trade-agreements";

const labelClass =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

function renumber(parts: AgreementPart[]): AgreementPart[] {
  return parts.map((part, index) => ({ ...part, position: index + 1 }));
}

/**
 * The sentence the database refused with — or, failing that, the room's own.
 *
 * PostgREST hands react-query a plain `{ message, code, details, hint }`, not
 * an `Error`, so gating on `instanceof Error` threw away every sentence 00575
 * was written to say ("An agreement carries only one ceiling", "every role on
 * the rate card needs a name") and printed the generic line in its place. The
 * refusal and the room say the same words because they are the same words.
 */
function refusalMessage(error: unknown, fallback: string): string {
  const message =
    error !== null && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : null;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : fallback;
}

export function AgreementComposer({
  proposal,
  bundle,
  onReturnToFacets,
}: {
  proposal: any;
  bundle: CommercialDocumentBundle;
  /** R24 — composing is a door, and this is the handle on the inside. The
   *  room above swaps back to the seven facets once the parts are gone. */
  onReturnToFacets?: () => void;
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
  const savePart = useSaveAgreementPart();
  const materialize = useMaterializeStandardParts(proposalId);
  const discard = useDiscardAgreementParts(proposalId);
  const attachClient = useAttachDocumentClient();
  const { user, status: authStatus } = useAuth();
  const clients = useClients();

  // Wave 2 — the Library. `agreement-parts` is already on (this component is
  // what that flag renders), so this second read IS `agreementParts &&
  // agreementLibrary`. Fail-closed: `useFeatureFlag` answers
  // { value: false, isLoading: true } until PostHog responds, and the extra
  // `!libraryLoading` says out loud that nothing Wave 2 renders may flash to
  // a studio the flag has not reached. Every hook here sits above every early
  // return in this file — there are none — and above every conditional.
  const { value: libraryFlag, isLoading: libraryLoading } =
    useFeatureFlag("agreement-library");
  const libraryOn = libraryFlag && !libraryLoading;

  // Wave 3 — the turnkey class. A THIRD nested gate, so `design-build` is
  // independent of the two before it and reaches nobody the earlier two have
  // not already reached: this component only renders under `agreement-parts`,
  // `libraryOn` is `agreement-library`, and both must hold before the turnkey
  // surfaces exist at all. Fail-closed the same way — `useFeatureFlag` reads
  // { value: false, isLoading: true } until PostHog answers, so nothing Wave 3
  // draws can flash to a studio the flag has not reached.
  const { value: designBuildFlag, isLoading: designBuildLoading } =
    useFeatureFlag("design-build");
  const designBuildOn = libraryOn && designBuildFlag && !designBuildLoading;

  // R32 — WHICH LIBRARY THIS AGREEMENT OPENS. Not the actor's own
  // organizations: `useOrganizations` returns them in no order at all, so for
  // a designer who belongs to two design studios it hands back an arbitrary
  // one, and an arbitrary studio's private parts are not this agreement's
  // Library. The database resolves the studio the AGREEMENT sits in — the
  // project's once it is bound, else the lead designer's in 00566's order —
  // and answers with the reader's own standing in it, which is R3's half:
  // owners and admins edit the Library, every active member composes from it.
  const studioContext = useAgreementStudioContext(proposalId);
  const studioId = studioContext.data?.studioId ?? null;
  const canManage = studioContext.data?.canManage === true;

  // R10 — the studio's self-attested credential, read once and used twice:
  // the template picker derives its disabled state from it, and readiness
  // holds the send on it. One read, so the picker and the panel cannot say
  // different things about the same studio.
  const attestation = useStudioLicenseAttestation(
    designBuildOn ? studioId : null,
  );
  const attestationLive = licenseAttestationIsLive(attestation.data ?? null);
  // R11 — what counsel has actually cleared. Empty on a seeded database, and
  // that is the intended answer.
  const notices = useAgreementJurisdictionNotices();
  const enabledJurisdictions = useMemo(
    () => (notices.data ?? []).map((notice) => notice.state),
    [notices.data],
  );
  // P12 — the draw ledger. Empty until the agreement is sent, because
  // `send_commercial_document` is what materializes it.
  const drawLedger = useAgreementDraws(
    designBuildOn && document.kind === "design_build" ? proposalId : null,
  );

  // The re-read after a Template is laid in. `materialize_agreement_template`
  // replaces the part set on the server and answers with a count; the room
  // holds the composition in local state, so it asks the table what it now
  // says rather than trusting a shape the mutation was never promised to
  // return.
  const partsRead = useAgreementParts(proposalId);
  const materializeTemplate = useMaterializeAgreementTemplate(proposalId);
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
  const [addOpen, setAddOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [keptPartIds, setKeptPartIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

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
    // `mutateAsync`, not `mutate` with callbacks. React Query drops the
    // callbacks passed to `mutate` when the observer unmounts before the RPC
    // answers, and `reactStrictMode` unmounts every component once on mount:
    // the nine rows were written and the parts key was invalidated, but the
    // room never heard, so it went on saying "This agreement has no parts
    // yet." until the designer reloaded. Awaiting the promise puts the
    // continuation in this file, where nothing can throw it away.
    void (async () => {
      try {
        const next = await materialize.mutateAsync();
        const seeded = renumber(
          [...next.parts].sort((a, b) => a.position - b.position),
        );
        setParts(seeded);
        setSelectedId((current) => current ?? seeded[0]?.id ?? null);
      } catch (error) {
        setSaveNote(
          refusalMessage(error, "The standard parts could not be opened."),
        );
      }
    })();
    // The agreement id is the remount key upstream; re-running this on a
    // background refetch would re-ask a question already answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  const recipientEmail =
    typeof proposal.client?.email === "string" ? proposal.client.email : null;
  const recipientName =
    proposal.client?.full_name ?? proposal.client_name ?? undefined;

  const turnkeyOn = designBuildOn && document.kind === "design_build";

  const readiness = useMemo(
    () =>
      assessAgreementReadiness({
        document,
        parts,
        recipientEmail,
        turnkey: turnkeyOn
          ? { attestationLive, enabledJurisdictions }
          : undefined,
      }),
    [
      document,
      parts,
      recipientEmail,
      turnkeyOn,
      attestationLive,
      enabledJurisdictions,
    ],
  );
  const blockedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const blocker of readiness.blockers) {
      if (blocker.partId) ids.add(blocker.partId);
    }
    return ids;
  }, [readiness]);
  const needAttention = partsNeedingAttention(readiness);

  // R18 / R29 — a save the server cannot accept is not offered. The database
  // refuses a second part of any money shape ("an agreement carries only one
  // ceiling", 23514) and a rate card carrying a role with no name ("every role
  // on the rate card needs a name"), and readiness says both sentences first;
  // holding the act as well is what keeps the room from ever earning those
  // refusals. Every other blocker still saves — a draft is allowed to be
  // unfinished, and the R4 floor is asked at the doors out of draft.
  const duplicates = useMemo(() => duplicateMoneyVariants(parts), [parts]);
  const unnamedRoles = useMemo(() => unnamedRateCardRoles(parts), [parts]);
  const refusedAtSave = duplicates.length > 0 || unnamedRoles.length > 0;

  const selected = parts.find((part) => part.id === selectedId) ?? null;

  const mutate = (next: AgreementPart[]) => {
    setParts(renumber(next));
    setDirty(true);
    setSaveNote(null);
  };

  const changePayload = (id: string, payload: Record<string, unknown>) =>
    mutate(parts.map((part) => (part.id === id ? { ...part, payload } : part)));

  /**
   * One turnkey editor writing a sibling part's payload — an allowance laying
   * down its cost line, the sub-disclosure clause storing its mode where the
   * validator reads it. Local, like every other act in this room: nothing
   * reaches the table until Save. A part key the composition does not carry is
   * a no-op, because a designer is allowed to remove a part and a sibling
   * editor must not resurrect it.
   */
  const writePart = (partKey: string, payload: Record<string, unknown>) =>
    mutate(
      parts.map((part) =>
        part.partKey === partKey ? { ...part, payload } : part,
      ),
    );

  /** R39 — hiding a part from the client. `client_visible` is the column;
   *  R33 already refuses to project a hidden fee and readiness already says
   *  so where the designer typed it. This is the act that sets it. */
  const setClientVisible = (id: string, clientVisible: boolean) => {
    const target = parts.find((part) => part.id === id) ?? null;
    mutate(
      parts.map((part) => (part.id === id ? { ...part, clientVisible } : part)),
    );
    if (target) {
      documentEvents.agreementPartVisibilityChanged({
        proposal_id: proposalId,
        kind: target.kind,
        variant: target.variant,
        client_visible: clientVisible,
      });
    }
  };

  const turnkeyContext: TurnkeyContext | undefined = turnkeyOn
    ? { parts, writePart, projectId: document.projectId }
    : undefined;

  const renamePart = (id: string, title: string) =>
    mutate(parts.map((part) => (part.id === id ? { ...part, title } : part)));

  const removePart = (id: string) => {
    const removed = parts.find((part) => part.id === id) ?? null;
    const next = parts.filter((part) => part.id !== id);
    mutate(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    if (libraryOn && removed) {
      documentEvents.agreementPartRemoved({
        proposal_id: proposalId,
        kind: removed.kind,
        variant: removed.variant,
      });
    }
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

  /**
   * A jurisdiction notice counsel HAS cleared, laid in as an attachment leaf
   * (R11). A held notice is never handed to this function — the strip renders
   * it greyed and non-attachable — and readiness refuses a send carrying one
   * even if it arrived some other way.
   */
  const attachNotice = (notice: {
    state: string;
    title: string;
    body: string;
  }) => {
    if (
      parts.some((part) => (part.payload ?? {}).jurisdiction === notice.state)
    )
      return;
    const added: AgreementPart = {
      id: localPartId(),
      proposalId,
      position: parts.length + 1,
      kind: "attachment",
      variant: null,
      partKey: `${TURNKEY_PART_KEYS.noticeOfCancellation}.${notice.state.toLowerCase()}`,
      title: notice.title,
      payload: {
        title: notice.title,
        body: notice.body,
        jurisdiction: notice.state,
        acknowledgeRequired: true,
      },
      required: false,
      clientVisible: true,
      sourceTemplateKey: null,
      sourcePartId: null,
      updatedAt: null,
    };
    mutate([...parts, added]);
    setSelectedId(added.id);
  };

  /**
   * A part chosen in the Library picker (M2), laid at the end of the rail.
   *
   * Local, like every other act in this room: the picker writes nothing, and
   * the part reaches the table with the rest of the composition when the
   * designer saves. `sourcePartId` rides along so the saved row can be traced
   * back to the Library entry it came from.
   */
  const addFromLibrary = (choice: AddPartChoice) => {
    const added: AgreementPart = {
      id: localPartId(),
      proposalId,
      position: parts.length + 1,
      kind: choice.kind,
      variant: choice.variant,
      partKey: choice.partKey,
      title: choice.title,
      payload: choice.payload,
      required: choice.required,
      clientVisible: choice.clientVisible,
      sourceTemplateKey: null,
      sourcePartId: choice.sourcePartId,
      updatedAt: null,
    };
    mutate([...parts, added]);
    setSelectedId(added.id);
    documentEvents.agreementPartSaved({
      proposal_id: proposalId,
      kind: choice.kind,
      variant: choice.variant,
      origin: choice.sourcePartId
        ? "library"
        : choice.partKey.startsWith("patina.")
          ? "patina"
          : "blank",
    });
  };

  /**
   * A Template, laid into this draft. The RPC replaces the part set wholesale
   * — which is exactly what the sheet warns about before this runs — so the
   * room throws away the composition it was holding and re-reads the one the
   * database now has. Unsaved edits go with it, which is why the sheet is
   * handed `dirty` and says so in the warning.
   */
  const applyTemplate = async (template: AgreementTemplate) => {
    setTemplateError(null);
    try {
      await materializeTemplate.mutateAsync(template.templateKey);
      const fresh = await partsRead.refetch();
      const landed = renumber(
        [...(fresh.data ?? [])].sort((a, b) => a.position - b.position),
      );
      setParts(landed);
      setSelectedId(landed[0]?.id ?? null);
      setDirty(false);
      setTemplatesOpen(false);
      setSaveNote(`The parts of ${template.title} are on this agreement.`);
      documentEvents.agreementTemplateMaterialized({
        proposal_id: proposalId,
        template_kind: template.kind,
        part_count: landed.length,
      });
      if (template.class === "design_build") {
        documentEvents.agreementTurnkeyComposed({
          proposal_id: proposalId,
          part_count: landed.length,
        });
      }
    } catch (error) {
      setTemplateError(
        refusalMessage(error, "That template could not be opened here."),
      );
    }
  };

  /**
   * One part, kept for the next agreement.
   *
   * The Library's PARTS shelf has always said "Compose an agreement, and what
   * you write there can be kept here" and no act anywhere performed the
   * keeping: `save_agreement_part` had exactly one caller in the portal, the
   * Library card's own RENAME. This is the act the sentence promised.
   *
   * The Library takes a DETACHED copy — `save_agreement_part` mints its own
   * `studio.<uuid>` key, so the composed part is untouched and the agreement
   * is not re-saved. Its client visibility and its required flag travel with
   * it as the defaults the picker lays down (R8), which is also the only road
   * by which a part can ever arrive on an agreement hidden from the client.
   */
  const keepInLibrary = async (part: AgreementPart) => {
    if (!studioId) {
      setSaveNote("This agreement has no studio Library to keep parts in.");
      return;
    }
    setSaveNote(null);
    try {
      await savePart.mutateAsync({
        studioId,
        kind: part.kind,
        variant: part.variant,
        title: part.title.trim(),
        payload: part.payload ?? {},
        requiredDefault: part.required,
        clientVisibleDefault: part.clientVisible,
      });
      setKeptPartIds((current) => new Set(current).add(part.id));
      setSaveNote(`${part.title.trim()} is in your Library.`);
    } catch (error) {
      setSaveNote(
        refusalMessage(error, "That part could not be kept in your Library."),
      );
    }
  };

  const persist = async () => {
    if (refusedAtSave) return false;
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
      setSaveNote(refusalMessage(error, "The agreement could not be saved."));
      return false;
    }
  };

  // R24 — the way back out. Merely OPENING this room composes the draft, and
  // `agreement-parts` is a per-person rollout: without a handle on the inside,
  // a co-member the flag has not reached could never save this agreement
  // again, in any room. `discard_agreement_parts` removes the parts and moves
  // no money — the terms row stays exactly as the last projection left it,
  // which is the state the seven-facet room reads and edits — so the document
  // returns to the paper it would have been on had this room never opened.
  // Draft only: a sent agreement's parts are what bind (R6).
  const returnToFacets = async () => {
    setSaveNote(null);
    try {
      await discard.mutateAsync();
      onReturnToFacets?.();
    } catch (error) {
      setSaveNote(
        refusalMessage(
          error,
          "The agreement could not be returned to the seven facets.",
        ),
      );
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
            refusalMessage(error, "The client account could not be attached."),
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
          disabled={refusedAtSave}
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
            {/* The three acts wrap on a narrow phone: unwrapped they measured
                617px against a 390px viewport and carried Save agreement off
                the right edge of the room. */}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
                Preview client copy
              </Button>
              {!readOnly && (
                <Button
                  variant="secondary"
                  onClick={() => void returnToFacets()}
                  loading={discard.isPending}
                >
                  {AGREEMENT_PART_COPY.returnToFacets}
                </Button>
              )}
              <Button
                onClick={() => void persist()}
                loading={save.isPending}
                disabled={!dirty || readOnly || refusedAtSave}
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
            libraryOn={libraryOn}
            onOpenLibrary={() => setAddOpen(true)}
            onOpenTemplatePicker={() => {
              setTemplateError(null);
              setTemplatesOpen(true);
            }}
            saveAsTemplate={
              <SaveAsTemplateAction
                proposalId={proposalId}
                canManage={canManage}
                disabled={parts.length === 0}
              />
            }
            // R3 draws the same line here as on the Template act: owners and
            // admins edit the Library, every active member composes from it.
            // `save_agreement_part` enforces it; hiding it is the courtesy.
            onKeepInLibrary={
              libraryOn && canManage && !readOnly
                ? (part) => void keepInLibrary(part)
                : undefined
            }
            keptPartIds={keptPartIds}
            visibilityOn={designBuildOn}
          />

          {/* The history strip needs a rhythm under the editor; flag off there
              is no strip, and the column stays the bare div Wave 1 shipped. */}
          <div className={libraryOn ? "space-y-6" : undefined}>
            {selected ? (
              <>
                <PartEditor
                  key={selected.id}
                  part={selected}
                  onChange={(payload) => changePayload(selected.id, payload)}
                  readOnly={readOnly}
                  libraryOn={libraryOn}
                  blockers={blockersForPart(readiness, selected.id)}
                  turnkey={turnkeyContext}
                  onToggleClientVisible={
                    designBuildOn && !readOnly
                      ? (hidden) => setClientVisible(selected.id, !hidden)
                      : undefined
                  }
                />
                {/* P8 — under the open part, and only under a part that has a
                    history. A part nobody has touched draws nothing. */}
                {libraryOn && (
                  <PartHistoryStrip
                    key={`history-${selected.partKey}`}
                    proposalId={proposalId}
                    partKey={selected.partKey}
                  />
                )}
              </>
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
              documentBlockers={[
                // Both of these are blockers ON a part, so the rail marks the
                // row; they are also the only blockers that hold Save, so the
                // panel says why in the same sentence.
                ...duplicates.map((duplicate) =>
                  duplicateMoneyBlocker(duplicate.label),
                ),
                ...(unnamedRoles.length > 0 ? [BLANK_ROLE_BLOCKER] : []),
                ...documentBlockers(readiness).map(
                  (blocker) => blocker.message,
                ),
              ]}
              notes={readiness.notes}
            />
            {turnkeyOn && (
              <>
                {/* R11 — what counsel has cleared, and what is held. There is
                    no enable control here or anywhere else in the studio's
                    face; a held notice is counsel's draft, not a studio's
                    paper. */}
                <JurisdictionAttachments
                  onAttach={readOnly ? undefined : attachNotice}
                  readOnly={readOnly}
                />
                {/* P9 · P13 — the ledger, and the studio's act on it. The
                    deposit is not billed from here: it is offered on the
                    homeowner's door the moment she signs. */}
                <DrawLedger
                  proposalId={proposalId}
                  draws={drawLedger.data ?? []}
                  executed={document.state === "executed"}
                />
                {/* P12 — the exchange, not the form. Empty until the
                    agreement is sent, because the ledger is materialized at
                    send from the frozen draws payload. */}
                <LienWaiverAttachments
                  proposalId={proposalId}
                  studioId={studioId}
                  draws={drawLedger.data ?? []}
                  recordedBy={user?.id ?? null}
                />
                {/* P14 — the subcontract, studio-side. It lives in the room's
                    right rail rather than in the Money room's ledger, which
                    is another lane's file. */}
                <TradeAgreementsStrip
                  projectId={document.projectId}
                  studioId={studioId}
                  sourceProposalId={proposalId}
                />
              </>
            )}
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

      {libraryOn && !readOnly && (
        <>
          <AddPartSheet
            open={addOpen}
            onClose={() => setAddOpen(false)}
            studioId={studioId}
            parts={parts}
            onAdd={addFromLibrary}
          />
          <TemplatePickerSheet
            open={templatesOpen}
            onClose={() => setTemplatesOpen(false)}
            studioId={studioId}
            documentKind={document.kind}
            onMaterialize={(template) => void applyTemplate(template)}
            pending={materializeTemplate.isPending}
            error={templateError}
            unsavedChanges={dirty}
            designBuildOn={designBuildOn}
            attestationLive={attestationLive}
          />
        </>
      )}

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
