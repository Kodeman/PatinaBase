"use client";

/**
 * The Agreement Room — the galley.
 *
 * The paper IS the page. Every part is printed through the very renderer the
 * client's copy is made of, in order, on one sheet; selecting a part unfolds
 * its editor BENEATH the printed form, which does not move. There is no rail,
 * no editor column, no preview aside and no preview sheet: one act at the
 * paper's foot, one count in one status region, and a full read that lays the
 * same body over the room rather than instead of it.
 *
 * Persistence is deliberately coarse: every act mutates local state and marks
 * the composition dirty, and a save writes the WHOLE ordered array through
 * `upsert_agreement_parts`. The RPC replaces wholesale, so a removed part is
 * absent rather than blank, and there is no half-saved agreement. There is no
 * Save control — §A5's "taken": the dated record line is what a save leaves
 * behind, and Review & send saves before it opens.
 *
 * The money row is not written here. `proposal_service_terms` is the server's
 * projection of the schedule parts (R5); this component never touches it.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAgreementDraws,
  useAgreementJurisdictionNotices,
  useAgreementParts,
  useMaterializeAgreementTemplate,
  useMaterializeStandardParts,
  useAgreementStudioContext,
  useSaveAgreementPart,
  useSaveAgreementParts,
  useStudioLicenseAttestation,
  licenseAttestationIsLive,
} from "@patina/supabase";
import {
  DESIGN_BUILD_COPY,
  agreementConsequenceSentence,
  type AgreementPart,
  type AgreementTemplate,
} from "@patina/types";
import { RoomShell } from "../../room-shell";
import { DocumentAction } from "../../../document-action";
import { ClientPicker } from "@/components/portal/client-picker";
import { RecordOnPaperSheet } from "../../../commercial/record-on-paper-sheet";
import { useAttachDocumentClient } from "@/hooks/use-attach-client";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-clients";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { documentEvents } from "@/lib/analytics/document-events";
import type { CommercialDocumentBundle } from "@/hooks/use-commercial-documents";
import type { CommercialDocument } from "@/lib/document/commercial-documents";
import { partDrawsNothing } from "../../../commercial/agreement-parts-body";
import { ServiceAgreementSendSheet } from "../../../commercial/service-agreement-send-sheet";
import { clearRoomOrigin, readRoomOrigin } from "@/lib/document/room-origin";
import {
  createBlankPart,
  duplicateMoneyVariants,
  localPartId,
  unnamedRateCardRoles,
  addPartOptions,
} from "./part-kinds";
import { AddPartMenu } from "./add-part-menu";
import { AddPartSheet, type AddPartChoice } from "./add-part-sheet";
import { TemplatePickerSheet } from "./template-picker-sheet";
import { SaveAsTemplateAction } from "./save-as-template-action";
import { AUTHORITY_STANDING_LABEL, authorityStanding } from "./schedules";
import {
  assessAgreementReadiness,
  blockersForPart,
  documentBlockers,
  duplicateMoneyBlocker,
  BLANK_ROLE_BLOCKER,
} from "./readiness";
import {
  DrawLedger,
  JurisdictionAttachments,
  LienWaiverAttachments,
  TURNKEY_PART_KEYS,
  type TurnkeyContext,
} from "./turnkey";
import { TradeAgreementsStrip } from "../../../commercial/trade-agreements";
import { GalleyPart, FoldAct, type GalleyPartIds } from "./galley/galley-part";
import { GalleyFold } from "./galley/galley-fold";
import { PartOutline } from "./galley/part-outline";
import { StudioStrip, StudioRun } from "./galley/studio-strip";
import { composeReadinessSentence } from "./galley/readiness-voice";
import { WholePaperSheet } from "./galley/whole-paper-sheet";
import "./galley/galley.css";

/** R21/FS-6 — what the studio reads where the client's copy prints nothing. */
const REST_ROW =
  "Not written yet. Your client’s copy does not print this part.";

const OWNER_ONLY_REASON =
  "Only the agreement owner can change the client account.";

function renumber(parts: AgreementPart[]): AgreementPart[] {
  return parts.map((part, index) => ({ ...part, position: index + 1 }));
}

/**
 * The first part the galley actually shows — build sheet PART 13's eleventh
 * entry, `patina.licensing_attestation`, is a `kind: 'attestation'` record
 * materialized at compose and never editable here (§8 marks it "gate"). It
 * rides in the composition and is saved with it; it is not a page of the
 * paper, so it is neither listed nor openable.
 */
export function firstRailPartId(parts: AgreementPart[]): string | null {
  return parts.find((part) => part.kind !== "attestation")?.id ?? null;
}

/**
 * The sentence the database refused with — or, failing that, the room's own.
 *
 * PostgREST hands react-query a plain `{ message, code, details, hint }`, not
 * an `Error`, so gating on `instanceof Error` threw away every sentence 00575
 * was written to say ("An agreement carries only one ceiling", "every role on
 * the rate card needs a name") and printed the generic line in its place.
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

/** `patina.role_rates` → `patina-role-rates`, so a part's four ids are stable
 *  across a save that re-mints every uuid (N-8/FS-26). */
function idsFor(partKey: string): GalleyPartIds {
  const slug = partKey.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return {
    section: `part-${slug}`,
    head: `head-${slug}`,
    foldAct: `write-${slug}`,
    foldPanel: `fold-${slug}`,
  };
}

function newestUpdate(parts: AgreementPart[]): string | null {
  let newest: string | null = null;
  for (const part of parts) {
    if (part.updatedAt && (newest === null || part.updatedAt > newest)) {
      newest = part.updatedAt;
    }
  }
  return newest;
}

/** `Saved 10 September 2026, 5:36 am` — the record that replaced Save. */
function savedLine(at: string | null): string {
  if (!at) return "Not saved yet";
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "Not saved yet";
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(when);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
    .format(when)
    .toLowerCase();
  return `Saved ${day}, ${time}`;
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
  // rest of the Supabase reads and writes, and they invalidate
  // `commercialKeys.all` — the prefix of this app's own document bundle key —
  // so the paper behind the room refetches on every save.
  const save = useSaveAgreementParts(proposalId);
  const savePart = useSaveAgreementPart();
  const materialize = useMaterializeStandardParts(proposalId);
  const attachClient = useAttachDocumentClient();
  const { user, status: authStatus } = useAuth();
  const clients = useClients();

  // Wave 2 — the Library. Fail-closed: `useFeatureFlag` answers
  // { value: false, isLoading: true } until PostHog responds, and the extra
  // `!libraryLoading` says out loud that nothing Wave 2 renders may flash to
  // a studio the flag has not reached.
  const { value: libraryFlag, isLoading: libraryLoading } =
    useFeatureFlag("agreement-library");
  const libraryOn = libraryFlag && !libraryLoading;

  // Wave 3 — the turnkey class, nested under the Library so `design-build`
  // reaches nobody the earlier gate has not already reached.
  const { value: designBuildFlag, isLoading: designBuildLoading } =
    useFeatureFlag("design-build");
  const designBuildOn = libraryOn && designBuildFlag && !designBuildLoading;

  // R32 — WHICH LIBRARY THIS AGREEMENT OPENS. The database resolves the studio
  // the AGREEMENT sits in and answers with the reader's own standing in it,
  // which is R3's half: owners and admins edit the Library, every active
  // member composes from it.
  const studioContext = useAgreementStudioContext(proposalId);
  const studioId = studioContext.data?.studioId ?? null;
  const canManage = studioContext.data?.canManage === true;

  // R10 — the studio's self-attested credential, read once and used twice.
  const attestation = useStudioLicenseAttestation(
    designBuildOn ? studioId : null,
  );
  const attestationLive = licenseAttestationIsLive(attestation.data ?? null);
  // R11 — what counsel has actually cleared.
  const notices = useAgreementJurisdictionNotices();
  const enabledJurisdictions = useMemo(
    () => (notices.data ?? []).map((notice) => notice.state),
    [notices.data],
  );
  // P12 — the draw ledger. Empty until the agreement is sent.
  const drawLedger = useAgreementDraws(
    designBuildOn && document.kind === "design_build" ? proposalId : null,
  );

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
  /**
   * WR-101 — the composition a QUEUED save will send. A `persist()` that runs
   * after an earlier one lands cannot read `parts` from the render closure
   * that asked for it, and a `setParts` updater does not run until React
   * flushes. So every write to the composition goes through `commitParts`,
   * which lands it in this ref in the same tick — and the ref, not the
   * closure, is what a save sends.
   */
  const partsRef = useRef(parts);
  const commitParts = (
    next: AgreementPart[] | ((current: AgreementPart[]) => AgreementPart[]),
  ) => {
    const value = typeof next === "function" ? next(partsRef.current) : next;
    partsRef.current = value;
    setParts(value);
  };

  /**
   * How many acts the paper has taken. `persist()` is fired WITHOUT being
   * awaited — closing a fold or selecting another part starts a save and the
   * designer goes on writing — so the room has to know, when the RPC answers,
   * whether the composition it sent is still the composition on the paper.
   */
  const revision = useRef(0);

  /**
   * WR-102 — a composition replaced wholesale from the server (a Template laid
   * in, the standard parts seeded) is an act like any other, so it bumps the
   * revision. Without the bump a save already in the air resolves with
   * `revision.current === sentAt`, takes the "the server's answer IS the
   * paper" branch, and lays the pre-template composition back over the
   * template it just replaced.
   */
  const replaceParts = (next: AgreementPart[]) => {
    revision.current += 1;
    commitParts(next);
  };
  /**
   * FS-31 — "selected" and "unfolded" are one state, and it keys on the PART
   * KEY, never a uuid: `upsert_agreement_parts` is DELETE-then-INSERT, so an
   * open editor keyed on `id` would remount mid-typing after every save
   * (N-8/ED-5). One open at a time; the paper resting is the default.
   */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(() =>
    newestUpdate(bundle.parts),
  );
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientNote, setClientNote] = useState<string | null>(null);
  const [clientError, setClientError] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [recordOnPaperOpen, setRecordOnPaperOpen] = useState(false);
  const [wholePaperOpen, setWholePaperOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /** Walk D2 — which seam the Library picker was opened from. Held in state
   *  rather than passed, because the picker is mounted once at the page's
   *  foot and not inside the seam that called it. */
  const [addAnchor, setAddAnchor] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  /** N-8/FS-26 — keyed on the part KEY, like everything else the room
   *  remembers about a part: `upsert_agreement_parts` is DELETE-then-INSERT,
   *  so a set of uuids forgets what it was told the moment a save lands. */
  const [keptPartKeys, setKeptPartKeys] = useState<Set<string>>(
    () => new Set<string>(),
  );
  /** What the one status region is saying instead of the readiness sentence —
   *  a reorder, a refusal, the reason a held act cannot be taken. Cleared the
   *  moment readiness itself has something new to say. */
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // §4.1 — with `design-build` off, a `design_build` agreement renders
  // read-only prose: the parts are shown, the editors are frozen, and nothing
  // this room cannot validate can be typed into a class whose validators are
  // not mounted.
  const turnkeyFrozen = document.kind === "design_build" && !designBuildOn;
  const readOnly = document.state !== "draft" || turnkeyFrozen;

  // Seed the nine standard parts from the terms row this agreement already
  // has. The ref is React 18 StrictMode's double-effect, not correctness.
  const materializeFired = useRef(false);
  useEffect(() => {
    if (materializeFired.current) return;
    if (readOnly) return;
    if (bundle.parts.length > 0) return;
    materializeFired.current = true;
    // `mutateAsync`, not `mutate` with callbacks: React Query drops the
    // callbacks passed to `mutate` when the observer unmounts before the RPC
    // answers, and `reactStrictMode` unmounts every component once on mount.
    void (async () => {
      try {
        const next = await materialize.mutateAsync();
        const seeded = renumber(
          [...next.parts].sort((a, b) => a.position - b.position),
        );
        replaceParts(seeded);
        setSavedAt(newestUpdate(seeded));
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
  // W3R2-06 — the room's chrome reads the KIND, never the flag: a frozen
  // turnkey draft is still a turnkey draft.
  const isTurnkeyKind = document.kind === "design_build";
  const currency = bundle.terms?.currency ?? "USD";

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
  /**
   * §A10 — ONE permanent status region, and this is the sentence in it. It
   * counts things to finish, not parts, and it never empties. The transition
   * form needs the readiness that was standing before this one, so the voice
   * is state rather than a memo: a memo would recompose from `null` on every
   * unrelated render and the sentence that just cleared would be lost.
   */
  const [readinessVoice, setReadinessVoice] = useState(() =>
    composeReadinessSentence(readiness, null),
  );
  const lastReadiness = useRef(readiness);
  useEffect(() => {
    if (readiness === lastReadiness.current) return;
    const next = composeReadinessSentence(readiness, lastReadiness.current);
    lastReadiness.current = readiness;
    // The comparison happens OUTSIDE the updater: an updater must be pure,
    // and StrictMode double-invokes it.
    setReadinessVoice((current) => {
      if (current !== next) setAnnouncement(null);
      return next;
    });
  }, [readiness]);

  // R18 / R29 — a save the server cannot accept is not offered.
  const duplicates = useMemo(() => duplicateMoneyVariants(parts), [parts]);
  const unnamedRoles = useMemo(() => unnamedRateCardRoles(parts), [parts]);
  const refusedAtSave = duplicates.length > 0 || unnamedRoles.length > 0;

  const rows = useMemo(
    () => parts.filter((part) => part.kind !== "attestation"),
    [parts],
  );

  /**
   * FS-19 — measure and restore. Opening or closing a fold changes the height
   * of the page below the part's own head, and the browser keeps the SCROLL
   * OFFSET rather than the reading position, so the paper slides under the
   * eye. No `overflow-anchor` exists anywhere in this portal; the house
   * pattern is imperative. The anchor is the toggled part's own section: the
   * fold opens beneath it, so its top must not move by a pixel (check 18).
   */
  const room = useRef<HTMLDivElement>(null);
  /**
   * N-15 — at 1440 the studio's notes are marginalia: out of the sheet's own
   * flow, set beside the part each one names, and pushed down only where the
   * one above runs long. CSS cannot lay a note against a sibling it is not a
   * child of, so the top is measured. Below 1248 the note returns to the flow
   * and interrupts the sheet, and this does nothing.
   */
  useEffect(() => {
    const node = room.current;
    if (!node || typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia("(min-width: 1248px)");
    const place = () => {
      const strips = [...node.querySelectorAll<HTMLElement>("[data-beside]")];
      if (!wide.matches) {
        for (const strip of strips) strip.style.top = "";
        return;
      }
      const top = node.getBoundingClientRect().top;
      const ordered = strips
        .map((strip) => {
          const part = window.document.getElementById(
            strip.dataset.beside ?? "",
          );
          return {
            strip,
            y: part ? part.getBoundingClientRect().top - top : 0,
          };
        })
        .sort((a, b) => a.y - b.y);
      let floor = 0;
      for (const { strip, y } of ordered) {
        const at = Math.max(y, floor);
        strip.style.top = `${Math.round(at)}px`;
        floor = at + strip.offsetHeight + 24;
      }
    };
    const schedule = () => window.requestAnimationFrame?.(place);
    schedule();
    window.addEventListener("resize", schedule);
    wide.addEventListener("change", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      wide.removeEventListener("change", schedule);
    };
  });

  const anchor = useRef<{ id: string; top: number } | null>(null);
  const rememberAnchor = (sectionId: string) => {
    const node = window.document.getElementById(sectionId);
    if (!node) return;
    anchor.current = { id: sectionId, top: node.getBoundingClientRect().top };
  };
  useLayoutEffect(() => {
    const held = anchor.current;
    anchor.current = null;
    if (!held) return;
    const node = window.document.getElementById(held.id);
    if (!node) return;
    const drift = node.getBoundingClientRect().top - held.top;
    if (drift !== 0) window.scrollBy?.(0, drift);
  }, [openKey]);

  /**
   * §A5 "taken" — there is no Save control, so closing a fold is what takes
   * the act, and the dated record is what it leaves behind. This is the same
   * whole-array `upsert_agreement_parts` the Save button called, not a
   * per-part write: N-7's projection round-trip (`scope` →
   * `materialize_standard_parts`) is untouched, and nothing is written a part
   * at a time.
   */
  const toggleFold = (part: AgreementPart) => {
    rememberAnchor(idsFor(part.partKey).section);
    if (dirty && !readOnly) void persist();
    setOpenKey((current) => (current === part.partKey ? null : part.partKey));
  };

  /**
   * Every act in this room goes through here, and every act may be one of a
   * PAIR. A turnkey editor writes its own payload and a sibling's in the same
   * handler, and two setters derived from the same render's `parts` would have
   * the second discard the first. So the updater form is the contract.
   */
  const mutate = (
    next: AgreementPart[] | ((current: AgreementPart[]) => AgreementPart[]),
  ) => {
    revision.current += 1;
    commitParts((current) =>
      renumber(typeof next === "function" ? next(current) : next),
    );
    setDirty(true);
    setSaveNote(null);
  };

  /**
   * N-8 — every act addresses a part by its KEY, never by `part.id`.
   * `upsert_agreement_parts` is DELETE-then-INSERT, so a save re-mints every
   * uuid: a handler that closed over the id it was rendered with matched
   * nothing once the save landed, and the write vanished without a word while
   * the field went on showing what was typed into it.
   */
  const changePayload = (partKey: string, payload: Record<string, unknown>) =>
    mutate((current) =>
      current.map((part) =>
        part.partKey === partKey ? { ...part, payload } : part,
      ),
    );

  /** One turnkey editor writing a sibling part's payload — the same road a
   *  part writes its own by. A part key the composition does not carry is a
   *  no-op, because a designer is allowed to remove a part and a sibling
   *  editor must not resurrect it. */
  const writePart = changePayload;

  /** R39/AR-e — hiding a part from the client, on every agreement now and not
   *  the turnkey lane alone. R33 already refuses to project a hidden fee and
   *  readiness says so where the designer typed it; this is the act. */
  const setClientVisible = (partKey: string, clientVisible: boolean) => {
    const target = parts.find((part) => part.partKey === partKey) ?? null;
    mutate((current) =>
      current.map((part) =>
        part.partKey === partKey ? { ...part, clientVisible } : part,
      ),
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

  const renamePart = (partKey: string, title: string) =>
    mutate((current) =>
      current.map((part) =>
        part.partKey === partKey ? { ...part, title } : part,
      ),
    );

  const removePart = (partKey: string) => {
    const removed = parts.find((part) => part.partKey === partKey) ?? null;
    mutate((current) => current.filter((part) => part.partKey !== partKey));
    if (removed && removed.partKey === openKey) setOpenKey(null);
    if (libraryOn && removed) {
      documentEvents.agreementPartRemoved({
        proposal_id: proposalId,
        kind: removed.kind,
        variant: removed.variant,
      });
    }
  };

  /**
   * Order, as a part act on the paper.
   *
   * Check 14/15 — the act announces the move in words and hands focus back to
   * the part's own control, and it needs no pointer: React moves the keyed
   * DOM node, which drops focus, and the move acts only show while the part
   * holds it, so the fold act takes focus first and its twin takes it back.
   */
  const pendingFocus = useRef<string | null>(null);
  const reorderPart = (part: AgreementPart, direction: "up" | "down") => {
    const from = parts.findIndex((entry) => entry.partKey === part.partKey);
    const to = from + (direction === "up" ? -1 : 1);
    if (from < 0 || to < 0 || to >= parts.length) return;
    const next = [...parts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    mutate(next);
    const place = next.filter((entry) => entry.kind !== "attestation");
    const position =
      place.findIndex((entry) => entry.partKey === part.partKey) + 1;
    setAnnouncement(
      `${part.title} is now part ${position} of ${place.length}.`,
    );
    pendingFocus.current = `${part.partKey}:${direction}`;
  };
  useLayoutEffect(() => {
    const wanted = pendingFocus.current;
    if (!wanted) return;
    pendingFocus.current = null;
    const key = wanted.split(":")[0]!;
    const head = window.document.getElementById(idsFor(key).foldAct);
    // The move acts are display:none until the part holds focus, and a hidden
    // element cannot take it — so the fold act takes it first, and reading a
    // layout property flushes the style change before the twin is asked.
    head?.focus();
    const twin = window.document.querySelector<HTMLElement>(
      `[data-move-act="${wanted}"]`,
    );
    if (twin && twin.offsetParent !== null) twin.focus();
  });

  /**
   * Walk D2 — the seam is a PLACE, not a decoration. `anchor` is the part key
   * the seam sits beneath, `"top"` the seam above the first part, and `null`
   * the page-level acts that name no seam and therefore append. An anchor the
   * composition no longer carries appends too, because a part removed while
   * its picker was open must not take the new part off the end of the paper.
   */
  const insertIndex = (current: AgreementPart[], anchor: string | null) => {
    if (anchor === null) return current.length;
    if (anchor === "top") return 0;
    const at = current.findIndex((part) => part.partKey === anchor);
    return at < 0 ? current.length : at + 1;
  };

  /** Lay a part in at its seam. `mutate` renumbers the whole array and the
   *  save sends the whole array, so the landing needs no position of its
   *  own — the splice IS the position. */
  const layIn = (added: AgreementPart, anchor: string | null) => {
    mutate((current) => {
      const next = [...current];
      next.splice(insertIndex(current, anchor), 0, added);
      return next;
    });
    setOpenKey(added.partKey);
  };

  const addPart = (
    input: {
      kind: AgreementPart["kind"];
      variant: AgreementPart["variant"];
    },
    anchor: string | null,
  ) => {
    const blank = createBlankPart({
      proposalId,
      kind: input.kind,
      variant: input.variant,
      position: insertIndex(parts, anchor) + 1,
    });
    layIn(blank, anchor);
  };

  /** A jurisdiction notice counsel HAS cleared, laid in as an attachment leaf
   *  (R11). A held notice is never handed to this function. */
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
    // A page-level act, not a seam: the notice is laid at the end.
    layIn(added, null);
  };

  /**
   * A part chosen in the Library picker (M2), laid at the seam the picker was
   * opened from (walk D2). Local, like every other act in this room: the
   * picker writes nothing, and the part reaches the table with the rest of
   * the composition on the save.
   */
  const addFromLibrary = (choice: AddPartChoice) => {
    const added: AgreementPart = {
      id: localPartId(),
      proposalId,
      position: insertIndex(parts, addAnchor) + 1,
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
    layIn(added, addAnchor);
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
   * — which is what the sheet warns about before this runs — so the room
   * throws away the composition it was holding and re-reads the one the
   * database now has.
   */
  const applyTemplate = async (template: AgreementTemplate) => {
    setTemplateError(null);
    try {
      await materializeTemplate.mutateAsync(template.templateKey);
      const fresh = await partsRead.refetch();
      const landed = renumber(
        [...(fresh.data ?? [])].sort((a, b) => a.position - b.position),
      );
      replaceParts(landed);
      setOpenKey(null);
      setDirty(false);
      setSavedAt(newestUpdate(landed) ?? new Date().toISOString());
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
   * One part, kept for the next agreement. The Library takes a DETACHED copy
   * — `save_agreement_part` mints its own `studio.<uuid>` key, so the composed
   * part is untouched and the agreement is not re-saved.
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
      setKeptPartKeys((current) => new Set(current).add(part.partKey));
      setSaveNote(`${part.title.trim()} is in your Library.`);
    } catch (error) {
      setSaveNote(
        refusalMessage(error, "That part could not be kept in your Library."),
      );
    }
  };

  /** R18/R29 — the sentence the room refuses a save with, before the server
   *  is ever asked. Named here because the record line, the status region and
   *  the held Send all have to say the same thing. */
  const localRefusal = (): string | null => {
    const duplicate = duplicates[0];
    if (duplicate) return duplicateMoneyBlocker(duplicate.label);
    if (unnamedRoles.length > 0) return BLANK_ROLE_BLOCKER;
    return null;
  };

  /**
   * WR-101 — the save currently in the air, the request to run one more when
   * it lands, and the tag that says which flight a landing belongs to.
   *
   * `persist()` is fired unawaited from two places, so two saves used to be
   * able to fly at once. `upsert_agreement_parts` is DELETE-then-INSERT: when
   * the server applied the OLDER of two overlapping calls last, the table kept
   * the older payload, the page kept the newer prose, and — because the newer
   * landing had already cleared `dirty` and the older landing took the stale
   * branch, which never re-asserts it — the record read a clean `Saved`. A
   * clause was gone with a green record. Only one call flies now.
   */
  const inFlight = useRef<Promise<boolean> | null>(null);
  const pendingSave = useRef(false);
  const saveSeq = useRef(0);

  /** One call to `upsert_agreement_parts`, and what its landing is allowed to
   *  do to the room. Never called concurrently with itself. */
  const flight = async (): Promise<boolean> => {
    const seq = (saveSeq.current += 1);
    const sentAt = revision.current;
    try {
      const next = await save.mutateAsync(partsRef.current);
      const saved = renumber(
        [...next.parts].sort((a, b) => a.position - b.position),
      );
      // A landing that is not the latest flight's is discarded outright: it
      // may not write the paper, and it may not clear the record.
      if (seq !== saveSeq.current) return true;
      // `dirty` clears only when nothing has moved since this call left — no
      // act on the paper, and no save already queued behind it.
      const behindThePage = revision.current !== sentAt || pendingSave.current;
      if (!behindThePage) {
        // Nothing was written while the save was in flight: the server's
        // answer IS the paper.
        commitParts(saved);
        setDirty(false);
      } else {
        // Something was. The rows the RPC handed back carry the payloads it
        // was SENT, one revision stale, so taking them wholesale would throw
        // away what the designer typed while it flew. Adopt the re-minted ids
        // by part KEY and keep the writing; the paper stays dirty, because
        // what is on the table is behind what is on the page.
        commitParts((current) => {
          const landed = new Map(saved.map((part) => [part.partKey, part]));
          return current.map((part) => {
            const row = landed.get(part.partKey);
            return row
              ? { ...part, id: row.id, updatedAt: row.updatedAt }
              : part;
          });
        });
      }
      setSavedAt(newestUpdate(saved) ?? new Date().toISOString());
      return true;
    } catch (error) {
      if (seq !== saveSeq.current) return false;
      // A queued save is about to carry the same composition again. It is the
      // one that gets to say whether the agreement could be saved.
      if (pendingSave.current) return false;
      // WR-101, the same rule on the refusing side: a refusal is only about
      // the composition this call CARRIED. The paper moved on while it flew,
      // so the sentence describes an agreement that no longer exists — and
      // printing it puts a refusal the designer has already answered back on
      // the room. `dirty` is untouched, so the record still says the table is
      // behind and the next act saves what is on the page now.
      if (revision.current !== sentAt) return false;
      const message = refusalMessage(
        error,
        "The agreement could not be saved.",
      );
      setSaveNote(message);
      setAnnouncement(message);
      return false;
    }
  };

  const persist = async (): Promise<boolean> => {
    if (refusedAtSave) {
      // Check 8/§A10 — a refusal is never silent. Without this, closing a
      // fold on a duplicate money variant did nothing and said nothing.
      const message = localRefusal();
      if (message) {
        setSaveNote(message);
        setAnnouncement(message);
      }
      return false;
    }
    const running = inFlight.current;
    if (running) {
      // One more save, once this one is down, carrying whatever the paper says
      // then. The caller waits on the SAME promise, so `reviewAndSend` opens
      // the send sheet on the final landing, not the first.
      pendingSave.current = true;
      return running;
    }
    const chain = (async () => {
      let outcome = await flight();
      while (pendingSave.current) {
        pendingSave.current = false;
        outcome = await flight();
      }
      return outcome;
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = chain;
    return chain;
  };

  const reviewAndSend = async () => {
    if (readOnly) return;
    if (dirty && !(await persist())) return;
    setSendOpen(true);
  };

  const changeClient = (clientId: string | null) => {
    setClientNote(null);
    setClientError(false);
    if (!ownsProposal) {
      setClientError(true);
      setClientNote(OWNER_ONLY_REASON);
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

  /* ── the paper, laid out ────────────────────────────────────────────────
     Every leaf carries its own printed form and, where the studio has
     something to say about it, a strip that sits OUTSIDE the paper (NO-4).
     A part that puts nothing on the paper prints nothing (R21/FS-6); its
     head and its `Write` act are in the strip instead. */
  const attachmentLetters = useMemo(() => {
    const letters = new Map<string, string>();
    let index = 0;
    for (const part of rows) {
      if (part.kind !== "attachment" || part.clientVisible === false) continue;
      letters.set(part.id, String.fromCharCode(65 + index));
      index += 1;
    }
    return letters;
  }, [rows]);

  const leaves = rows.map((part) => {
    const drawsNothing = partDrawsNothing(part, currency, turnkeyOn);
    // R39 — `AgreementPartsBody` filters a hidden part out before it renders
    // anything, so the galley's paper must not print one either: the sheet
    // here IS the client's copy. It keeps its rest row in the studio's margin,
    // which is also where the act that shows it again lives.
    const hiddenFromClient = part.clientVisible === false;
    const silent = drawsNothing || hiddenFromClient;
    const partBlockers = blockersForPart(readiness, part.id);
    const standing =
      libraryOn && part.kind === "schedule"
        ? AUTHORITY_STANDING_LABEL[authorityStanding(part.variant)]
        : null;
    const quiet = !silent && partBlockers.length === 0;
    return {
      part,
      ids: idsFor(part.partKey),
      drawsNothing,
      hiddenFromClient,
      silent,
      partBlockers,
      standing,
      quiet,
      hasStrip: !quiet || standing !== null,
    };
  });

  const attentionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const blocker of readiness.blockers) {
      if (!blocker.partId) continue;
      const part = parts.find((entry) => entry.id === blocker.partId);
      if (part) keys.add(part.partKey);
    }
    return keys;
  }, [readiness, parts]);

  const standingsRun = (() => {
    const gathered = new Map<string, string[]>();
    for (const leaf of leaves) {
      if (!leaf.standing) continue;
      const names = gathered.get(leaf.standing) ?? [];
      names.push(leaf.part.title);
      gathered.set(leaf.standing, names);
    }
    return [...gathered.entries()].map(([standing, names]) => ({
      standing,
      names,
    }));
  })();

  const canHide = (part: AgreementPart) =>
    // R48 (W3R2-01) — the act does not exist on the two parts that state the
    // money. The database refuses both (`upsert_agreement_parts`,
    // `send_commercial_document`, 00578) and readiness says so; withholding
    // the act is what keeps the room from offering the refusal at all.
    !readOnly &&
    !(
      part.kind === "schedule" &&
      (part.variant === "pricing_basis" || part.variant === "draws")
    );

  const seamAct = (place: string) =>
    readOnly ? null : (
      <div className="g-seam" key={`seam-${place}`}>
        {libraryOn ? (
          <button
            type="button"
            className="g-act g-act--tertiary"
            onClick={() => {
              setAddAnchor(place);
              setAddOpen(true);
            }}
          >
            <span className="g-label">+ Add a part</span>
          </button>
        ) : (
          <AddPartMenu
            options={addPartOptions(parts)}
            onAdd={(input) => addPart(input, place)}
          />
        )}
      </div>
    );

  const foldFor = (part: AgreementPart, partBlockers: string[]) => (
    <GalleyFold
      // ED-5/N-8 — the part key survives a DELETE-then-INSERT save; the uuid
      // does not, and an editor keyed on it remounts mid-typing.
      key={`fold-${part.partKey}`}
      part={part}
      proposalId={proposalId}
      record={
        !savedAt
          ? "Not saved yet"
          : dirty
            ? `${savedLine(savedAt)} · ${part.title} not yet saved`
            : savedLine(savedAt)
      }
      readOnly={readOnly}
      libraryOn={libraryOn}
      blockers={partBlockers}
      turnkey={turnkeyContext}
      onChange={(payload) => changePayload(part.partKey, payload)}
      onRename={(title) => renamePart(part.partKey, title)}
      onRemove={() => removePart(part.partKey)}
      onKeepInLibrary={
        // R3 draws the same line here as on the Template act: owners and
        // admins edit the Library, every active member composes from it.
        libraryOn && canManage && !readOnly
          ? () => void keepInLibrary(part)
          : undefined
      }
      kept={keptPartKeys.has(part.partKey)}
    />
  );

  const sheet: React.ReactNode[] = [];
  /* A strip carrying nothing but a name and a standing is marginalia and
     nothing more: below 1248 it does not print at all (the standings gather
     into one run instead), so it must not part the sheet either. It is still
     outside the paper in the DOM (NO-4) — it is set out of flow at 1440 and
     placed against its part by measure, so its position in the markup does
     not decide where it sits. */
  const marginalia: React.ReactNode[] = [];
  let segment: React.ReactNode[] = [seamAct("top")];
  let segmentIndex = 0;
  const flush = () => {
    if (segment.filter(Boolean).length === 0) return;
    sheet.push(
      <article
        key={`segment-${segmentIndex}`}
        className="g-paper"
        aria-labelledby="agreement-paper-head"
      >
        {segmentIndex === 0 && (
          <h2 className="t-d2 g-paper__head" id="agreement-paper-head">
            {document.title}
          </h2>
        )}
        {segment}
      </article>,
    );
    segment = [];
    segmentIndex += 1;
  };

  for (const leaf of leaves) {
    const {
      part,
      ids,
      drawsNothing,
      hiddenFromClient,
      silent,
      partBlockers,
      standing,
      quiet,
    } = leaf;
    const isOpen = part.partKey === openKey;
    if (leaf.hasStrip) {
      const strip = (
        <StudioStrip
          key={`strip-${part.partKey}`}
          label={`The studio · ${part.title}`}
          name={part.title}
          // The head's id belongs to whichever of the two carries the fold
          // act: the paper's own head, or — when the paper prints nothing —
          // the strip's rest row.
          nameId={silent ? ids.head : undefined}
          standing={standing}
          beside={ids.section}
          quiet={quiet}
        >
          {silent && (
            <>
              {drawsNothing && <p className="t-body-sm">{REST_ROW}</p>}
              {hiddenFromClient && (
                <>
                  <p className="t-head g-strip__standing">
                    {DESIGN_BUILD_COPY.hiddenFromClient}
                  </p>
                  <p className="t-body-sm">
                    {DESIGN_BUILD_COPY.hiddenFromClientHelp}
                  </p>
                </>
              )}
              <p>
                <FoldAct
                  ids={ids}
                  open={isOpen}
                  onToggle={() => toggleFold(part)}
                  labelledBy={ids.head}
                />
                {hiddenFromClient && canHide(part) && (
                  <button
                    type="button"
                    className="g-act g-act--tertiary"
                    data-client-visible="false"
                    onClick={() => setClientVisible(part.partKey, true)}
                  >
                    <span className="g-label">Show to the client</span>
                  </button>
                )}
              </p>
            </>
          )}
          {partBlockers.map((message, index) => (
            <p
              className="t-body-sm"
              key={message}
              id={`${ids.section}-blocker-${index}`}
            >
              {message}
            </p>
          ))}
        </StudioStrip>
      );
      if (quiet) {
        marginalia.push(strip);
      } else {
        flush();
        sheet.push(strip);
      }
    }
    segment.push(
      <GalleyPart
        // N-8/FS-26/§3 R2 — `upsert_agreement_parts` is DELETE-then-INSERT, so
        // `part.id` is a NEW uuid after every save and a leaf keyed on it
        // remounts the open fold mid-writing, losing the caret. The part key
        // survives the round trip; `GalleyFold` and `openKey` already use it.
        key={part.partKey}
        part={part}
        ids={ids}
        currency={currency}
        turnkey={turnkeyOn}
        attachmentLetter={attachmentLetters.get(part.id)}
        drawsNothing={silent}
        open={isOpen}
        readOnly={readOnly}
        canMoveUp={rows[0]?.partKey !== part.partKey}
        canMoveDown={rows[rows.length - 1]?.partKey !== part.partKey}
        onToggle={() => toggleFold(part)}
        onMove={(direction) => reorderPart(part, direction)}
        onHide={
          canHide(part)
            ? (next) => setClientVisible(part.partKey, !next)
            : undefined
        }
      >
        {foldFor(part, partBlockers)}
      </GalleyPart>,
    );
    if (!silent) segment.push(seamAct(part.partKey));
  }
  flush();

  /* The blockers that belong to no part, printed once, in the studio's own
     ground at the paper's foot — they are what the held Send points at, so
     they have to be visible and they have to resolve (check 7). */
  const roomBlockers = [
    ...new Set(documentBlockers(readiness).map((blocker) => blocker.message)),
  ];
  /* The reason a held Send points at has to be words on the page, and it has
     to resolve (check 7). A blocker about the whole agreement is printed at
     the foot; one about a part is printed in that part's own strip, and its
     id is the strip's. */
  const heldOn = readiness.blockers.find((blocker) => blocker.partId !== null);
  /* WR-104 — the one lookup in this room still made on `part.id` rather than
     `partKey`, and the only one that may be: `readiness` is memoized from THIS
     render's `parts`, so the uuid a blocker was filed under is the uuid the
     part is rendered with. A blocker never outlives the render that made it,
     which is what N-8 forbids and what every handler had to be moved off. */
  const heldOnPart = heldOn
    ? parts.find((entry) => entry.id === heldOn.partId)
    : undefined;
  /* The reason a held act points at must be visible and must resolve. A
     part-filed blocker is printed in that part's own strip; a document one at
     the foot; and where the foot prints nothing the sentence the designer can
     read is the readiness region itself, which never empties. */
  const liveBlockerId = readOnly
    ? "agreement-frozen-reason"
    : heldOnPart
      ? `${idsFor(heldOnPart.partKey).section}-blocker-0`
      : roomBlockers.length > 0
        ? "agreement-blocker-0"
        : "room-status";

  const retainer = parts.find(
    (part) => part.kind === "schedule" && part.variant === "retainer",
  );
  const retainerCents = Number((retainer?.payload ?? {}).cents);
  const sendLabel =
    Number.isFinite(retainerCents) && retainerCents > 0
      ? `Send the agreement · ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
        }).format(retainerCents / 100)} retainer`
      : "Send the agreement";

  const sendHeld = !readiness.ready || refusedAtSave || readOnly;
  /* Check 8 — activating a held act never fails silently: it writes the
     reason into the one status region and moves focus to the part that is
     unmet, or to the seam where the missing part would be added. */
  const sayWhyHeld = () => {
    // The blocker announced is the blocker whose part takes the focus: the
    // two were different sentences, so the room named the fee floor and sent
    // the caret to a part the fee floor had nothing to do with.
    const reason =
      heldOn?.message ??
      roomBlockers[0] ??
      readiness.blockers[0]?.message ??
      localRefusal() ??
      undefined;
    if (reason) setAnnouncement(reason);
    const target = heldOnPart
      ? window.document.getElementById(idsFor(heldOnPart.partKey).foldAct)
      : window.document.querySelector<HTMLElement>(".g-seam .g-act");
    target?.focus();
  };

  const preparedFor = recipientName
    ? recipientEmail
      ? `${recipientName} · ${recipientEmail}`
      : recipientName
    : (recipientEmail ?? null);

  return (
    <RoomShell
      title={
        isTurnkeyKind
          ? DESIGN_BUILD_COPY.roomTitle
          : "The Contract Room · Design Agreement"
      }
    >
      <div className="g-page">
        <div className="g-room" ref={room}>
          <header className="g-head">
            <p className="t-head g-eyebrow">
              {/* W3R2-06 — keyed off the document's KIND, not the flag. */}
              {isTurnkeyKind
                ? DESIGN_BUILD_COPY.roomEyebrow
                : "Design services agreement"}
              {` · V${document.version}`}
            </p>
            <h1 className="t-d2">
              {recipientName ?? recipientEmail ?? "A draft with no client yet"}
            </h1>
            <p className="t-head g-eyebrow">
              {document.state === "draft" ? "Draft" : document.state}
            </p>
            <p className="t-body g-prepared">
              {preparedFor
                ? `Prepared for ${preparedFor} — `
                : "Prepared for no one yet — "}
              <button
                type="button"
                className="g-act g-act--inline"
                aria-disabled={!ownsProposal || readOnly ? "true" : undefined}
                /* Check 7 — held on EITHER path, so the reason resolves on
                   either path: the owner sentence when the reader does not own
                   the agreement, the frozen sentence when it has left the
                   studio. */
                aria-describedby={
                  !ownsProposal
                    ? "agreement-client-reason"
                    : readOnly
                      ? "agreement-frozen-reason"
                      : undefined
                }
                onClick={() => {
                  if (!ownsProposal || readOnly) {
                    setAnnouncement(OWNER_ONLY_REASON);
                    return;
                  }
                  setClientOpen(true);
                }}
              >
                <span className="g-label">
                  {preparedFor ? "Change the client account" : "Link a client"}
                </span>
              </button>
            </p>
            {/* Not gated on auth status: the act above points here from the
                first paint, and a describedby at a node that does not exist
                is a held act with no reason at all. */}
            {!ownsProposal && (
              <p className="t-body-sm g-reason" id="agreement-client-reason">
                {OWNER_ONLY_REASON}
              </p>
            )}
            {clientOpen && (
              <div className="mt-3 max-w-sm">
                <ClientPicker
                  value={
                    typeof proposal.client_id === "string"
                      ? proposal.client_id
                      : null
                  }
                  onChange={changeClient}
                  disabled={attachClient.isPending || authStatus === "loading"}
                  clientOptions={ownerClients}
                  ariaLabel="Client account"
                  requireClientLogin
                  placeholder="Select or invite a client…"
                />
              </div>
            )}
            {clientNote && (
              <p
                className="t-body-sm g-reason"
                role={clientError ? "alert" : undefined}
              >
                {clientNote}
              </p>
            )}
            <p className="t-meta g-record">
              {/* The header record is the AGREEMENT's and the fold's is the
                  part's, so the two lines are complementary rather than the
                  same string printed twice on one page. */}
              {!savedAt
                ? "Not saved yet"
                : dirty
                  ? `${savedLine(savedAt)} · This agreement not yet saved`
                  : savedLine(savedAt)}
            </p>
            {saveNote && <p className="t-body-sm g-reason">{saveNote}</p>}
            {readOnly && (
              <p className="t-body-sm g-reason" id="agreement-frozen-reason">
                {turnkeyFrozen
                  ? // W3R1-08 — a turnkey DRAFT with `design-build` off has not
                    // left the studio; what is true is that the class's editors
                    // are not mounted for this reader.
                    "This is a design-build agreement, and it does not open for you yet. Its parts are shown as they stand."
                  : "This agreement has left the studio. Its parts are fixed as sent."}
              </p>
            )}
            {/* §A10, checks 5/6 — ONE region, authored here, present at load,
                never conditionally mounted and never empty. */}
            <p className="studio-note" id="room-status-wrap">
              <span className="t-head head">The studio</span>
              <span
                className="t-body"
                id="room-status"
                role="status"
                aria-live="polite"
              >
                {announcement ?? readinessVoice}
              </span>
            </p>
          </header>

          <PartOutline
            parts={rows}
            openKey={openKey}
            attentionKeys={attentionKeys}
            onSelect={(partKey) => {
              const part = rows.find((entry) => entry.partKey === partKey);
              if (!part) return;
              const section = window.document.getElementById(
                idsFor(partKey).section,
              );
              section?.scrollIntoView?.({ block: "start" });
              rememberAnchor(idsFor(partKey).section);
              if (dirty && !readOnly) void persist();
              setOpenKey(partKey);
            }}
            libraryOn={libraryOn}
            readOnly={readOnly}
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
          />

          {sheet}
          {marginalia}
          <StudioRun standings={standingsRun} />

          <div className="g-galley-foot">
            {roomBlockers.length > 0 && (
              <div className="studio-note g-blockers">
                <span className="t-head head">The studio</span>
                {roomBlockers.map((message, index) => (
                  <p
                    className="t-body-sm"
                    key={message}
                    id={`agreement-blocker-${index}`}
                  >
                    {message}
                  </p>
                ))}
              </div>
            )}
            {readiness.notes.length > 0 && (
              <div className="studio-note g-blockers">
                <span className="t-head head">The studio</span>
                {readiness.notes.map((note) => (
                  <p className="t-body-sm" key={note}>
                    {note}
                  </p>
                ))}
              </div>
            )}
            {/* §A6 — the consequence, then the act it describes, then the
                quietest way to read what is being sent. */}
            <p className="g-consequence">
              {agreementConsequenceSentence({
                recipientName,
                parts,
                currency,
              })}
            </p>
            <div className="g-send-row">
              <DocumentAction
                actionKey="review-design-agreement"
                variant="terminal"
                disabled={sendHeld}
                held
                aria-describedby={sendHeld ? liveBlockerId : undefined}
                onHeldActivate={sayWhyHeld}
                onClick={() => void reviewAndSend()}
              >
                {sendLabel}
              </DocumentAction>
              <DocumentAction
                actionKey="read-whole-agreement"
                variant="tertiary"
                onClick={() => setWholePaperOpen(true)}
              >
                Read the whole paper
              </DocumentAction>
            </div>
          </div>

          {turnkeyOn && (
            <div className="g-turnkey-run">
              {/* R11 — what counsel has cleared, and what is held. */}
              <JurisdictionAttachments
                onAttach={readOnly ? undefined : attachNotice}
                readOnly={readOnly}
              />
              {/* P9 · P13 — the ledger, and the studio's act on it. */}
              <DrawLedger
                proposalId={proposalId}
                draws={drawLedger.data ?? []}
                executed={document.state === "executed"}
              />
              {/* P12 — the exchange, not the form. */}
              <LienWaiverAttachments
                proposalId={proposalId}
                studioId={studioId}
                draws={drawLedger.data ?? []}
                recordedBy={user?.id ?? null}
              />
              {/* P14 — the subcontract, studio-side. */}
              <TradeAgreementsStrip
                projectId={document.projectId}
                studioId={studioId}
                sourceProposalId={proposalId}
              />
            </div>
          )}
        </div>
      </div>

      <WholePaperSheet
        open={wholePaperOpen}
        onClose={() => setWholePaperOpen(false)}
        previewProps={previewProps}
      />

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
        parts={parts}
        readinessOverride={{
          ready: readiness.ready,
          // R49 — a blocker about a PAIR is filed against the room and both
          // parts, so the sheet would otherwise print one sentence three
          // times. The sheet lists reasons, not rows.
          blockers: [
            ...new Set(readiness.blockers.map((blocker) => blocker.message)),
          ],
          notes: readiness.notes,
        }}
        // 00477 — a signature taken at a kitchen table is findable from the
        // place it is needed. The seven-facet room was this act's other
        // caller; the galley is what replaced it.
        onRecordOffline={
          document.state === "draft" &&
          Boolean(bundle.terms) &&
          bundle.rates.length > 0
            ? () => {
                setSendOpen(false);
                setRecordOnPaperOpen(true);
              }
            : undefined
        }
      />

      {recordOnPaperOpen && (
        <RecordOnPaperSheet
          kind="design-services"
          proposalId={proposalId}
          clientName={recipientName ?? ""}
          neverSent={document.state === "draft"}
          open
          onClose={() => setRecordOnPaperOpen(false)}
          onRecorded={() => {
            setRecordOnPaperOpen(false);
            setAnnouncement(
              "Paper signature recorded. Countersign it once you’re ready.",
            );
          }}
        />
      )}
    </RoomShell>
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
