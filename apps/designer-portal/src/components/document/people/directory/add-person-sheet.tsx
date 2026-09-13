"use client";

/**
 * Add a person (Track A · Track 9 · Field Coordination Wave 5) — a quiet paper
 * sheet over the People Room for bringing someone onto the roster. The person
 * kinds are chosen in DM-mono page-link grammar (never tabs):
 *
 *  · client — the proven `useAddClient` mutation (auth-guarded server route,
 *    optional magic-link invite, audit row).
 *  · maker  — R78 / PRC-03: the vendor-creation door. Finds-or-creates the
 *    vendor (`useFindOrCreateVendor`), then SAVES it (`useSaveVendor`).
 *  · gc / sub / installer / receiver — the field crew (00281). A per-project
 *    project_parties row with an optional phone + "Text updates" opt-in. When
 *    the opt-in is on, the row is written with consent 'pending', which fires
 *    the opt-in SMS invite server-side (Track B trigger) — the UI writes the
 *    row only, never the invite.
 *
 * On success every path invalidates the directory read model and hands the Room
 * a quiet inline confirmation (R51 grammar — no toast, R83). Errors render
 * inline at the act site.
 *
 * F3 — EDIT mode. Pass `contact` (an existing `studio_contacts` row) and this
 * same sheet opens on that card instead of creating a new one: the kind choice
 * is hidden (entity_kind/contact_kind are locked — this never re-kinds a
 * card), the Name/Company/Trade/Phone/Email fields prefill from the record,
 * the submit button reads "Save", and submit calls `useUpdateStudioContact`
 * with only the fields that actually changed. `onSaved` fires in place of
 * `onAdded` on success — there is no directory tab to land on, since the
 * caller is already sitting on the card's own profile.
 *
 * F3-R2-14 — a card with `vendor_id` set (every 00418 pass-A/B row) is the
 * studio's OWN COPY of a maker: this editor only ever writes the
 * `studio_contacts` row it was opened on, never the `vendors` row `vendor_id`
 * points at. "Makers stay read-only (vendor-owned)" governs that shared
 * `vendors` record, not the studio's private label for it — so this sheet
 * intentionally still edits a vendor-backed card's copy.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAddClient,
  useAddProjectParty,
  useAddStudioContactChannel,
  useFindOrCreateVendor,
  usePromoteToStudioContact,
  useSaveVendor,
  useSetAffiliation,
  useSetContactRule,
  useSetPartyAuthority,
  useStudioContacts,
  useStudioIdentity,
  useUpdateStudioContact,
  peopleKeys,
  peopleSeatKeys,
  ALL_AUTHORITY_SCOPES,
  AUTHORITY_SCOPE_LABELS,
  isAdminOnlyAuthorityScope,
  type AuthorityScope,
  type PartyKind,
  type ProjectParty,
  type StudioContact,
} from "@patina/supabase";
import { ALL_FIELD_TRADES, FIELD_TRADE_LABELS } from "@patina/types";
import { useOrganizations } from "@patina/supabase";
import type { DirectoryChip } from "@/lib/document/directory-roles";
import { useProjects } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useProjectAuthority } from "../../roster/use-project-authority";
import { clientEvents } from "@/lib/analytics/events";
import { DocumentAction, DocumentActionGroup } from "../../document-action";
import { RoomSheet } from "../../rooms/room-sheet";
import {
  LetterLineField,
  checkboxHelper,
  checkboxLabel,
  givenNameOf,
  sendButtonLabel,
  successLine,
} from "./letter-line-field";

export type AddedPersonKind =
  | "client"
  // PR-c / C5 — one new door for the second half of a household. It writes a
  // `client_rep` seat carrying the authority grant; the string `client_rep`
  // never appears on a face.
  | "household"
  | "maker"
  | "gc"
  | "sub"
  | "installer"
  | "receiver"
  // PR-f — somebody the eight words do not name. A written label is required,
  // because an unnamed other is the row that goes dark.
  | "other_named";

/** The four kinds this sheet writes as `project_parties` rows. Pinned as a
 *  literal union rather than `Extract<AddedPersonKind, PartyKind>`: the Call
 *  Sheet program widened PartyKind to include 'client' (00419), which would
 *  silently pull 'client' into this predicate's narrowing and make the
 *  maker/client branches below unreachable. FIELD_PARTY_KINDS stays four
 *  values — so does this. */
type FieldAddKind = "gc" | "sub" | "installer" | "receiver";
const FIELD_KINDS: FieldAddKind[] = ["gc", "sub", "installer", "receiver"];
/** Every kind this sheet writes as a SEAT on a project — the four field kinds
 *  plus the household member and the named other. */
type SeatAddKind = FieldAddKind | "household" | "other_named";
const SEAT_KINDS: SeatAddKind[] = [...FIELD_KINDS, "household", "other_named"];
const isSeatKind = (k: AddedPersonKind): k is SeatAddKind =>
  (SEAT_KINDS as string[]).includes(k);

/**
 * The `party_kind` each seat door writes. A household member is a
 * `client_rep`; a named other writes `other`, the widest kind
 * `project_parties_party_kind_check` admits today — `other_named` is refused
 * by Postgres until the CHECK widens (`PARTY_KINDS_ACCEPTED_BY_DB`), so the
 * written label rides in `trade`, the seat's one free-text descriptor, and the
 * roster line already prints it beside the kind.
 */
const SEAT_PARTY_KIND: Record<SeatAddKind, PartyKind> = {
  gc: "gc",
  sub: "sub",
  installer: "installer",
  receiver: "receiver",
  household: "client_rep",
  other_named: "other",
};

/** Trade is REQUIRED for the trade kinds (sub / installer), not optional: a
 *  sub with no trade cannot be found by the trade line the Directory narrows
 *  with. */
const showsTrade = (k: AddedPersonKind) => k === "sub" || k === "installer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * QA-R3-1 — SAY WHAT ACTUALLY WENT WRONG.
 *
 * PostgREST rejections arrive as a PLAIN OBJECT (`{message, code, details,
 * hint}`), not an `Error`. Both submit paths tested `e instanceof Error` and
 * fell through to "Could not add them just now. Try again." for every one of
 * them, which is how a wrong-studio `promoteToStudioContact` refusal reached
 * the designer as a shrug. A raw Postgres string is still never printed: an RLS
 * or permission refusal is translated, and a schema word (SPEC §8 #3) is
 * replaced by the fallback rather than shown.
 */
function writeErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: unknown } | null)?.code;
  const raw =
    err instanceof Error
      ? err.message
      : (((err as { message?: unknown } | null)?.message as
          | string
          | undefined) ?? "");
  const haystack = `${typeof code === "string" ? code : ""} ${raw}`;
  if (/row-level security|permission denied|42501|PGRST116/i.test(haystack)) {
    return "This studio's book is not yours to write. Ask an owner or admin.";
  }
  // CR-3 — 00624's `party_card_guard_trg` refusals, said in words. They are
  // raised as bare tokens, which the schema-word guard below does not catch,
  // so without these three the token itself reached the face.
  if (/party_card_project_has_no_studio/i.test(haystack)) {
    return "This project isn't attached to a studio yet, so a firm from the studio's book can't be put on its seats. Give the project a studio first.";
  }
  if (/party_company_other_studio/i.test(haystack)) {
    return "That firm belongs to another studio's book, so it can't be named on this job.";
  }
  if (/party_company_not_a_company/i.test(haystack)) {
    return "A person doesn't hold the subcontract — name the firm's own card here.";
  }
  // Never a schema word on a face: a constraint or index name, a relation, a
  // column. Those sentences are for the log, not the studio.
  if (
    !raw.trim() ||
    /duplicate key|violates|constraint|idx_|_fkey|_pkey|column |relation /i.test(
      raw,
    )
  ) {
    return fallback;
  }
  return raw;
}

const FIELD_LABEL =
  "mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";
const FIELD_INPUT =
  "w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none";

const KIND_CHOICES: Array<[AddedPersonKind, string]> = [
  ["client", "a client"],
  ["household", "a household member"],
  ["maker", "a maker"],
  ["gc", "a GC"],
  ["sub", "a sub"],
  ["installer", "an installer"],
  ["receiver", "a receiver"],
  ["other_named", "someone else"],
];

/** The quiet kind choice — DM-mono page links, never tabs (R28 grammar). */
function KindChoice({
  kind,
  onKind,
}: {
  kind: AddedPersonKind;
  onKind: (k: AddedPersonKind) => void;
}) {
  return (
    <div
      role="group"
      aria-label="What kind of person"
      className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-[var(--color-pearl)] pb-2.5"
    >
      {KIND_CHOICES.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onKind(k)}
          aria-pressed={kind === k}
          className={`min-h-11 rounded-[3px] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
            kind === k
              ? "text-[var(--color-clay-ink)]"
              : "text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const KIND_NOUN: Record<PartyKind, string> = {
  gc: "general contractor",
  sub: "subcontractor",
  installer: "installer",
  receiver: "receiver",
  vendor: "vendor",
  client_rep: "client rep",
  other: "contact",
  // Call Sheet (00419) widened PartyKind; this sheet only ever indexes the
  // four field kinds, but the map must stay total.
  client: "client",
  architect: "architect",
  photographer: "photographer",
  stager: "stager",
  // PR-f's four. `other_named` reads "other" like `other` does: the studio
  // types the actual word beside it (`partyKindRequiresLabel`).
  inspector: "inspector",
  lender: "lender",
  engineer: "engineer",
  other_named: "other",
};

export function AddPersonSheet({
  open,
  onClose,
  onAdded,
  onGoToLeads,
  initialKind = "client",
  contact = null,
  onSaved,
  organizationId: organizationIdProp = null,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * QA-R3-1 — THE STUDIO THE BOOK IS IN, resolved by the caller.
   *
   * This sheet used to guess with `orgs.find(o => o.type === 'design_studio')`
   * — a first match over an UNORDERED membership read. `designer@patina.dev`
   * belongs to two design studios and every rolodex card and the Okonkwo
   * project belong to only one of them, so `promoteToStudioContact` and the
   * authority grant wrote against the wrong org about half the time and the
   * sheet answered "Could not add them just now." Both callers already hold
   * the answer: the People Room's `directoryRolodexOrgId` fold, and the
   * rolodex review sheet's own studio id.
   */
  organizationId?: string | null;
  /** The kind the sheet opens on (⌘K "Add a maker" cold-starts on 'maker'). */
  initialKind?: AddedPersonKind;
  /** Fired with a confirmation line + the directory filter to land on, so the
   *  Room can surface the right roster with the line inline (no toast). */
  onAdded?: (message: string, landOn: DirectoryChip) => void;
  /** Walk out to lead intake (the pipeline) for a prospect rather than a client. */
  onGoToLeads?: () => void;
  /** F3 — when present, the sheet opens in EDIT mode for this existing
   *  rolodex card instead of creating a new one. See the module doc. */
  contact?: StudioContact | null;
  /** F3 — fired on a successful edit-mode save, in place of `onAdded`. */
  onSaved?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const addClient = useAddClient();
  // R83: this sheet renders failures inline — keep the global toast silent.
  const findOrCreateVendor = useFindOrCreateVendor({ errorSurface: "inline" });
  const saveVendor = useSaveVendor({ errorSurface: "inline" });
  const addParty = useAddProjectParty();
  const updateContact = useUpdateStudioContact();
  // The chain a seat write pulls behind it: the rolodex CARD the rule and the
  // channels hang on, and the authority grant the seat carries (Leah tasks 1
  // and 2). A seat alone cannot hold a contact rule — the rule belongs to the
  // person, so every add that types one mints the card too.
  const promoteToCard = usePromoteToStudioContact();
  const addChannel = useAddStudioContactChannel();
  const contactRuleWrite = useSetContactRule();
  const setAuthority = useSetPartyAuthority();
  const setAffiliation = useSetAffiliation();
  const { data: orgs } = useOrganizations();
  // QA-R3-1: the caller's answer wins. The fallback is the membership list
  // SORTED by id — never `.find()` over an unordered read, which is the defect
  // itself: a designer in two design studios got a different answer between
  // renders, and half of them were the studio that holds neither the project
  // nor the cards.
  const organizationId = useMemo(() => {
    if (organizationIdProp) return organizationIdProp;
    const sorted = [...(orgs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    return (
      sorted.find((o) => o.type === "design_studio")?.id ??
      sorted[0]?.id ??
      null
    );
  }, [organizationIdProp, orgs]);
  const { data: rolodex } = useStudioContacts(organizationId, {
    includeArchived: false,
  });
  const firms = useMemo(
    () => (rolodex ?? []).filter((c) => c.entity_kind === "company"),
    [rolodex],
  );
  const isEditMode = !!contact;

  const { data: projectsRaw } = useProjects();
  // Real (persisted) projects only — the mock fallback returns slug ids a party
  // FK can't reference; a field party is per-project so a project is required.
  const projects = useMemo(
    () =>
      ((projectsRaw ?? []) as Array<{ id: string; name?: string | null }>)
        .filter((p) => UUID_RE.test(p.id))
        .map((p) => ({ id: p.id, name: p.name ?? "Untitled project" })),
    [projectsRaw],
  );

  const [kind, setKind] = useState<AddedPersonKind>(initialKind);
  // Re-seed the kind each time the sheet opens (⌘K may cold-start on 'maker').
  useEffect(() => {
    if (open) setKind(initialKind);
  }, [open, initialKind]);
  // Client fields.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState(true);
  const [note, setNote] = useState("");
  const { value: letterOn, isLoading: letterLoading } = useFeatureFlag(
    "client-invite-letter",
  );
  const { data: studioIdentity } = useStudioIdentity({
    designerId: user?.id ?? null,
  });
  const studioName = studioIdentity?.name ?? null;
  const clientGiven = givenNameOf(name);
  // Maker fields (R78: name · specialty · orders email · website).
  const [makerName, setMakerName] = useState("");
  const [category, setCategory] = useState("");
  const [ordersEmail, setOrdersEmail] = useState("");
  const [website, setWebsite] = useState("");
  // Field-party fields (00281).
  const [partyName, setPartyName] = useState("");
  const [company, setCompany] = useState("");
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [partyEmail, setPartyEmail] = useState("");
  const [projectId, setProjectId] = useState("");
  const [textUpdates, setTextUpdates] = useState(false);
  const [consentSource, setConsentSource] = useState<
    "" | "verbal" | "written" | "web_form" | "other"
  >("");
  const [consentEvidence, setConsentEvidence] = useState("");

  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  // SPEC §5.5 — the four fields the redesigned sheet adds.
  const [firmId, setFirmId] = useState("");
  const [otherLabel, setOtherLabel] = useState("");
  const [contactRule, setContactRuleText] = useState("");
  const [authorityPhrase, setAuthorityPhrase] = useState("");
  // R-J / C20 — the Authority field opens from one of two acts, never sits
  // there looking pre-filled (SPEC §5.5 #16).
  const [authorityOpen, setAuthorityOpen] = useState(false);
  const authorityFieldId = useId();
  /**
   * CR-20 — WHAT THE CHAIN HAS ALREADY WRITTEN.
   *
   * `submitParty` chains five awaited mutations. A failure at step four used
   * to leave steps one to three committed, the sheet open, and a second press
   * of "Add to the roster" writing a SECOND seat. The chain now RESUMES from
   * here instead of restarting: every step records itself, and a retry redoes
   * only what is still owed. Cleared by `reset()` — a fresh add is a fresh
   * chain.
   */
  const chainRef = useRef<{
    party: ProjectParty | null;
    cardId: string | null;
    mobileWritten: boolean;
    emailWritten: boolean;
    ruleWritten: boolean;
    affiliationWritten: boolean;
  }>({
    party: null,
    cardId: null,
    mobileWritten: false,
    emailWritten: false,
    ruleWritten: false,
    affiliationWritten: false,
  });

  /**
   * CR-12 — THE SCOPE AND THE FIGURE ARE THE STUDIO'S TO RECORD.
   *
   * The scope used to be hard-coded (`household ? 'change_order' :
   * 'selections'`) and no surface anywhere could write a threshold, so SPEC
   * §5.4 #5's "Signs money to $2,500." had a renderer and no writer, and PR-n's
   * client-side gate on the admin-only scopes was vacuously true — the DB
   * policy was the only half that existed.
   */
  const isOrgAdmin = useMemo(() => {
    const role = (orgs ?? []).find((o) => o.id === organizationId)?.membership
      ?.role;
    return role === "owner" || role === "admin";
  }, [orgs, organizationId]);
  const defaultAuthorityScope: AuthorityScope =
    kind === "household" ? "change_order" : "selections";
  const [authorityScope, setAuthorityScope] = useState<AuthorityScope>(
    defaultAuthorityScope,
  );
  const [authorityThreshold, setAuthorityThreshold] = useState("");
  // The sheet's kind decides the sensible default; a studio that opens the
  // band may say something else.
  useEffect(() => {
    setAuthorityScope(defaultAuthorityScope);
  }, [defaultAuthorityScope]);
  // PR-n: money and draw certification are an owner's or an admin's to grant.
  // The DB refuses them either way; the face says so before the press.
  useEffect(() => {
    if (!isOrgAdmin && isAdminOnlyAuthorityScope(authorityScope)) {
      setAuthorityScope(defaultAuthorityScope);
    }
  }, [isOrgAdmin, authorityScope, defaultAuthorityScope]);
  const { data: projectGrants } = useProjectAuthority(
    open && projectId ? projectId : null,
  );
  const agreementClause = useMemo(() => {
    for (const grants of Object.values(projectGrants ?? {})) {
      for (const grant of grants) {
        const clause = grant.scope === authorityScope ? grant.source_clause : null;
        if (clause?.trim()) return clause.trim();
      }
    }
    return null;
  }, [projectGrants, authorityScope]);

  // F3 — edit mode prefill. Keyed on the card's own id (not the object
  // reference): a background refetch of the same card while the sheet is
  // open must never clobber an in-progress edit.
  const contactId = contact?.id ?? null;
  // F3-R1-01/16 — a company card's "name" IS company_name; a person card's is
  // full_name. F3-R1-06 — a card whose profile_id is set belongs to someone
  // with a Patina account, who self-manages name/email/phone there (mirrors
  // HouseholdSheet's hasProfile branch); only trade, company, and notes stay
  // studio-editable for it here.
  const isCompanyContact = contact?.entity_kind === "company";
  const hasProfile = !!contact?.profile_id;
  const contactDisplayName =
    contact?.full_name ?? contact?.company_name ?? "this contact";
  // F3-R2-10 — a company card's name is a studio-book fact even when the
  // card also carries a profile_id (not a state we expect, but the primary
  // field must not vanish entirely if it occurs): render/validate/diff it
  // whenever it's the company-name field, and otherwise only when there's no
  // profile to self-manage the person's name.
  const primaryFieldRendered = isCompanyContact || !hasProfile;
  // F3-R2-09 — a seeded vendor card's specialties[0] can sit outside the
  // field-trade vocab (VendorSpecialty, not FieldTrade); shown as its own
  // option so the editor renders what the record holds instead of a blank
  // control that discards the value on any unrelated save.
  const originalSpecialty = contact?.specialties?.[0] ?? null;
  const outOfVocabSpecialty =
    originalSpecialty &&
    !(ALL_FIELD_TRADES as readonly string[]).includes(originalSpecialty)
      ? originalSpecialty
      : null;
  useEffect(() => {
    if (!open || !contact) return;
    setPartyName(contact.full_name ?? "");
    setCompany(contact.company_name ?? "");
    setTrade(contact.specialties?.[0] ?? "");
    setPhone(contact.phone ?? "");
    setPartyEmail(contact.email ?? "");
    setNotes(contact.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId]);

  const reset = () => {
    setKind("client");
    setName("");
    setEmail("");
    setInvite(true);
    setNote("");
    setMakerName("");
    setCategory("");
    setOrdersEmail("");
    setWebsite("");
    setPartyName("");
    setCompany("");
    setTrade("");
    setPhone("");
    setPartyEmail("");
    setProjectId("");
    setTextUpdates(false);
    setConsentSource("");
    setConsentEvidence("");
    setNotes("");
    setFirmId("");
    setOtherLabel("");
    setContactRuleText("");
    setAuthorityPhrase("");
    setAuthorityThreshold("");
    setAuthorityScope(defaultAuthorityScope);
    setAuthorityOpen(false);
    chainRef.current = {
      party: null,
      cardId: null,
      mobileWritten: false,
      emailWritten: false,
      ruleWritten: false,
      affiliationWritten: false,
    };
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submitClient = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(
        "An email brings them onto the roster — and lets you reach them.",
      );
      return;
    }
    try {
      const result = await addClient.mutateAsync({
        clientEmail: trimmedEmail,
        clientName: name.trim() || undefined,
        source: "direct",
        invite,
        ...(letterOn && invite
          ? { letter: true as const, note: note.trim() || undefined }
          : {}),
      });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const label = name.trim() || trimmedEmail;
      // The server decides whether R13's notice actually fired
      // (`kind === 'notice'`), not the designer's own checkbox — the checkbox
      // only requests a letter; branch A can still link silently underneath.
      const letterActuallySent = result.alreadyExists
        ? result.kind === "notice"
        : invite;
      const message = letterOn
        ? successLine({
            label,
            email: trimmedEmail,
            sent: letterActuallySent,
            alreadyExisted: result.alreadyExists,
          })
        : result.alreadyExists
          ? `${label} is already on Patina — linked to their account, now on your roster.`
          : result.invited
            ? `${label} added — a magic-link invite is on its way.`
            : `${label} added to your roster.`;
      onAdded?.(message, "clients");
      clientEvents.create({ has_note: letterOn && invite && !!note.trim() });
      reset();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, "Could not add them just now. Try again."));
    }
  };

  const submitMaker = async () => {
    setError(null);
    const trimmedName = makerName.trim();
    if (!trimmedName) {
      setError("A maker needs at least a name — the shop you order from.");
      return;
    }
    try {
      const result = await findOrCreateVendor.mutateAsync({
        name: trimmedName,
        website: website.trim() || undefined,
        primaryCategory: category.trim() || undefined,
        ordersEmail: ordersEmail.trim() || undefined,
      });
      await saveVendor.mutateAsync({ vendorId: result.vendorId });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const message = result.isNew
        ? `${result.vendor.name} added — a new maker on your roster.`
        : `${result.vendor.name} was already in the book — now on your roster.`;
      onAdded?.(message, "makers");
      reset();
      onClose();
    } catch (e) {
      setError(
        writeErrorMessage(e, "Could not add the maker just now. Try again."),
      );
    }
  };

  const submitParty = async () => {
    if (!isSeatKind(kind)) return;
    setError(null);
    const trimmedName = partyName.trim();
    const partyKind = SEAT_PARTY_KIND[kind];
    if (!projectId) {
      setError("Field crew work a project — pick which one they\u2019re on.");
      return;
    }
    if (!trimmedName) {
      setError(`A ${KIND_NOUN[partyKind]} needs a name.`);
      return;
    }
    // PR-f: an unnamed other is the row that goes dark.
    if (kind === "other_named" && !otherLabel.trim()) {
      setError("Say what they are to this job.");
      return;
    }
    // A sub or an installer with no trade cannot be found by the trade line.
    if (showsTrade(kind) && !trade) {
      setError("A sub or an installer needs the trade they work in.");
      return;
    }
    if (textUpdates && !phone.trim()) {
      setError(
        "Texting updates needs a phone number — or turn the toggle off.",
      );
      return;
    }
    if (textUpdates && (!consentSource || !consentEvidence.trim())) {
      setError(
        "Record how and where they gave prior consent before sending a text.",
      );
      return;
    }
    const matchedFirm = firms.find((f) => f.id === firmId) ?? null;
    const firmName = matchedFirm?.company_name ?? company;
    try {
      // CR-20: RESUME, never restart. A press that failed at step four must
      // not write a second seat on the retry.
      const chain = chainRef.current;
      if (!chain.party) {
        const party = await addParty.mutateAsync({
          projectId,
          partyKind,
          displayName: trimmedName,
          companyName: firmName,
          // CR-3: the picked card's ID, not only its name. The select stored
          // `firmId` and then threw it away — so a person added through the
          // front door had no firm IDENTITY, and `directoryFirmOf` (which
          // reads `meta.company_id`) returned null for every one of them.
          // A firm typed by hand has no card yet and stays a snapshot string.
          companyId: matchedFirm?.id ?? null,
          // A named other carries its written label where the seat has room
          // for it; a trade kind carries its trade (see SEAT_PARTY_KIND's
          // note).
          trade:
            kind === "other_named"
              ? otherLabel.trim()
              : showsTrade(kind)
                ? trade
                : null,
          phone,
          email: partyEmail,
          textUpdates,
          smsConsentSource: consentSource || undefined,
          smsConsentEvidence: consentEvidence,
        });
        chain.party = party;
        chain.cardId = party.studio_contact_id ?? null;
      }
      const party = chain.party;

      // The rule and the typed channels belong to the PERSON, not the seat, so
      // a card is minted when either is written and none was auto-linked.
      const wantsCard =
        !!contactRule.trim() || !!phone.trim() || !!partyEmail.trim();
      if (!chain.cardId && wantsCard && organizationId) {
        const card = await promoteToCard.mutateAsync({ organizationId, party });
        chain.cardId = (card as { id?: string } | null)?.id ?? null;
      }
      const cardId = chain.cardId;
      if (cardId) {
        if (phone.trim() && !chain.mobileWritten) {
          await addChannel.mutateAsync({
            ownerType: "person",
            ownerId: cardId,
            channelKind: "mobile",
            value: phone.trim(),
            smsCapable: true,
            preferred: true,
          });
          chain.mobileWritten = true;
        }
        if (partyEmail.trim() && !chain.emailWritten) {
          await addChannel.mutateAsync({
            ownerType: "person",
            ownerId: cardId,
            channelKind: "email",
            value: partyEmail.trim(),
          });
          chain.emailWritten = true;
        }
        if (contactRule.trim() && !chain.ruleWritten) {
          await contactRuleWrite.mutateAsync({
            subjectType: "person",
            subjectId: cardId,
            // CR-21: NOTHING IS INFERRED. The forbidden list used to be read
            // off whether the Email box happened to be blank, so "Email only.
            // No cell for work." typed beside an empty Email box wrote a rule
            // FORBIDDING email — the opposite of what the studio said, and
            // what every send gate would then read. The studio's sentence is
            // recorded as the reason; which channel is barred is written on
            // the person card, where there are controls that say so.
            channelsForbidden: [],
            reason: contactRule.trim(),
            // CR3-2: MERGE. `chain.cardId` is often an EXISTING card — 00626's
            // `apply_party_rolodex_link_trg` links a new seat to the one card in
            // the studio carrying that phone — and the default write is a
            // full-row upsert. Adding Frank Bauer to a second job with a
            // sentence typed here erased his standing do-not-contact rule and
            // the route to Rosa Delgado behind it. The forbidden list IS
            // supplied (empty, deliberately — CR-21: nothing is inferred) for a
            // NEW rule; merge keeps a standing one's list, route and hours.
            merge: true,
          });
          chain.ruleWritten = true;
        }
        // CR-3: the same fact on the ROLODEX side. The seat's `company_id`
        // ties this JOB to the firm; the affiliation ties the PERSON to it,
        // and that is what the company card's Crew & designations, the firm
        // row's "N on the crew" and the person card's firm line all read.
        // Designations (signer, paperwork, licence) are the company card's to
        // set — this only records that they work there.
        if (matchedFirm && !chain.affiliationWritten) {
          await setAffiliation.mutateAsync({
            personId: cardId,
            companyId: matchedFirm.id,
          });
          chain.affiliationWritten = true;
        }
      }
      if (authorityPhrase.trim() || authorityThreshold.trim()) {
        // CR-12: PR-n's client half. The DB policy reserves `money` and
        // `draw_certify` to an owner or an admin; the sheet refuses them before
        // the write rather than letting Postgres answer.
        if (!isOrgAdmin && isAdminOnlyAuthorityScope(authorityScope)) {
          throw new Error(
            "Signing money and certifying draws are the studio owner's or an admin's to grant.",
          );
        }
        const dollars = authorityThreshold.trim();
        const amount = dollars === "" ? null : Number(dollars.replace(/,/g, ""));
        if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
          throw new Error("Write the figure in dollars — 2500, not $2.5k.");
        }
        await setAuthority.mutateAsync({
          engagementId: party.id,
          projectId,
          scope: authorityScope,
          thresholdCents: amount == null ? null : Math.round(amount * 100),
          sourceClause: authorityPhrase.trim() || null,
        });
      }
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });

      const proj =
        projects.find((p) => p.id === projectId)?.name ?? "the project";
      // CR-4: R-AS took both halves off the seat INSERT, so
      // `fc_optin_invite_dispatch` no longer fires and NOTHING is sent. The
      // sheet says what actually happened; the record-side dispatch is W3's.
      // CR3-1: what was written is an INVITE (`record_channel_invite` records
      // `pending` unless a standing grant already stood), so the confirmation
      // names the invite, not consent.
      const message =
        textUpdates && phone.trim()
          ? `${trimmedName} added to ${proj}. The invite is recorded; nothing has been sent yet.`
          : `${trimmedName} added to ${proj}.`;
      onAdded?.(message, kind === "household" ? "clients" : "crew");
      reset();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, "Could not add them just now. Try again."));
    }
  };

  /** F3 — edit an existing rolodex card. Diffs the form against the record
   *  and patches only what changed; entity_kind/contact_kind are never sent
   *  (locked in edit mode). A no-op edit just closes the sheet.
   *
   *  F3-R1-01/16 — a company card's name lives in `company_name`; only a
   *  person card's uses `full_name` — sending the wrong column would
   *  overwrite one with the other on a save that touched neither.
   *  F3-R1-06 — a profile-holder's name/phone/email are never diffed (the
   *  fields are hidden in that render branch, but this guards the write
   *  itself, not just the UI). Company stays studio-owned either way (the
   *  Company field renders regardless of `hasProfile`), so it is never
   *  gated on it (F3-R2-08).
   *  F3-R1-09 — trade patches element 0 of `specialties` in place rather
   *  than replacing the whole array, so a card with more than one specialty
   *  keeps the rest.
   *  F3-R2-07 — the primary Name/Company-name field only renders when
   *  `primaryFieldRendered` (mirrors the render branch below); validating
   *  and diffing it when it's off-screen blocks saving an unrelated field
   *  (e.g. Notes) on a profile-holding person whose `full_name` is NULL.
   *  F3-R2-06 — Notes is diffed for every card, not only profile-holders. */
  const submitEditContact = async () => {
    if (!contact) return;
    setError(null);
    const trimmedCompany = company.trim();
    const trimmedName = partyName.trim();
    const primaryValue = isCompanyContact ? trimmedCompany : trimmedName;
    if (primaryFieldRendered && !primaryValue) {
      setError(
        isCompanyContact
          ? "This company needs a name."
          : "This contact needs a name.",
      );
      return;
    }
    const trimmedTrade = trade.trim();
    const originalTrade = contact.specialties?.[0] ?? "";
    const trimmedNotes = notes.trim();

    const patch: Partial<{
      fullName: string;
      companyName: string | null;
      specialties: string[];
      phone: string | null;
      email: string | null;
      notes: string | null;
    }> = {};
    if (isCompanyContact) {
      if (trimmedCompany !== (contact.company_name ?? ""))
        patch.companyName = trimmedCompany || null;
    } else {
      if (!hasProfile && trimmedName !== (contact.full_name ?? ""))
        patch.fullName = trimmedName;
      if (trimmedCompany !== (contact.company_name ?? ""))
        patch.companyName = trimmedCompany || null;
    }
    if (trimmedTrade !== originalTrade) {
      const restSpecialties = (contact.specialties ?? []).slice(1);
      patch.specialties = trimmedTrade
        ? [trimmedTrade, ...restSpecialties]
        : restSpecialties;
    }
    if (trimmedNotes !== (contact.notes ?? ""))
      patch.notes = trimmedNotes || null;
    if (!hasProfile) {
      const trimmedPhone = phone.trim();
      const trimmedEmail = partyEmail.trim();
      if (trimmedPhone !== (contact.phone ?? ""))
        patch.phone = trimmedPhone || null;
      if (trimmedEmail !== (contact.email ?? ""))
        patch.email = trimmedEmail || null;
    }

    if (Object.keys(patch).length === 0) {
      close();
      return;
    }

    const confirmationName = primaryValue || contactDisplayName;
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        organizationId: contact.organization_id,
        ...patch,
      });
      onSaved?.(`${confirmationName}’s details are saved.`);
      reset();
      onClose();
    } catch (e) {
      setError(writeErrorMessage(e, "Could not save just now. Try again."));
    }
  };

  const pending =
    addClient.isPending ||
    findOrCreateVendor.isPending ||
    saveVendor.isPending ||
    addParty.isPending ||
    promoteToCard.isPending ||
    contactRuleWrite.isPending ||
    updateContact.isPending;

  const submit = isEditMode
    ? submitEditContact
    : isSeatKind(kind)
      ? submitParty
      : kind === "client"
        ? submitClient
        : submitMaker;

  const intro = isEditMode
    ? `Update ${contactDisplayName}’s card — the whole studio sees the change.`
    : kind === "client"
      ? "Add a client to your directory. They appear on your roster at once; an optional invite gives them a Patina login."
      : kind === "maker"
        ? "Add a maker — a shop you order through. They join your roster and the Orders book can route POs to them."
        : `Add a ${KIND_NOUN[SEAT_PARTY_KIND[kind as SeatAddKind]]} to a project. With a phone and a text opt-in, you can coordinate them over SMS — and they land on your People roster.`;

  return (
    <RoomSheet
      open={open}
      onClose={close}
      title={
        isEditMode ? `Edit ${contactDisplayName}` : "Add someone to your people"
      }
    >
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
        {isEditMode ? "Edit · your rolodex" : "Add · to your roster"}
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        {isEditMode ? `Edit ${contactDisplayName}` : "Bring someone in"}
      </h2>
      <p className="mb-4 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        {intro}
      </p>

      {!isEditMode && (
        <KindChoice
          kind={kind}
          onKind={(k) => {
            setKind(k);
            setError(null);
          }}
        />
      )}

      {isEditMode ? (
        <>
          {hasProfile && (
            <p className="mb-4 text-[0.72rem] italic leading-relaxed text-[var(--color-aged-oak)]">
              {contactDisplayName}’s name, email, and phone are managed in their
              Patina account. Trade, company, and notes still update here.
            </p>
          )}

          {primaryFieldRendered && (
            <>
              <label className={FIELD_LABEL} htmlFor="edit-contact-name">
                {isCompanyContact ? "Company name" : "Name"}
              </label>
              <input
                id="edit-contact-name"
                type="text"
                value={isCompanyContact ? company : partyName}
                onChange={(e) =>
                  isCompanyContact
                    ? setCompany(e.target.value)
                    : setPartyName(e.target.value)
                }
                className={`${FIELD_INPUT} mb-4`}
              />
            </>
          )}

          {!isCompanyContact && (
            <>
              <label className={FIELD_LABEL} htmlFor="edit-contact-company">
                Company <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="edit-contact-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className={`${FIELD_INPUT} mb-4`}
              />
            </>
          )}

          <label className={FIELD_LABEL} htmlFor="edit-contact-trade">
            Trade <span className="opacity-60">(optional)</span>
          </label>
          <select
            id="edit-contact-trade"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          >
            <option value="">Which trade…</option>
            {outOfVocabSpecialty && (
              <option value={outOfVocabSpecialty}>{outOfVocabSpecialty}</option>
            )}
            {ALL_FIELD_TRADES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TRADE_LABELS[t]}
              </option>
            ))}
          </select>

          <label className={FIELD_LABEL} htmlFor="edit-contact-notes">
            Notes <span className="opacity-60">(optional)</span>
          </label>
          <textarea
            id="edit-contact-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${FIELD_INPUT} ${hasProfile ? "" : "mb-4"} resize-none`}
          />

          {!hasProfile && (
            <>
              <label className={FIELD_LABEL} htmlFor="edit-contact-phone">
                Phone <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="edit-contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${FIELD_INPUT} mb-4`}
              />

              <label className={FIELD_LABEL} htmlFor="edit-contact-email">
                Email <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="edit-contact-email"
                type="email"
                value={partyEmail}
                onChange={(e) => setPartyEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                className={FIELD_INPUT}
              />
            </>
          )}
        </>
      ) : kind === "client" ? (
        <>
          <label className={FIELD_LABEL} htmlFor="client-full-name">
            Full name <span className="opacity-60">(optional)</span>
          </label>
          <input
            id="client-full-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL} htmlFor="client-email">
            Email
          </label>
          <input
            id="client-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className={FIELD_INPUT}
          />

          {/* Fail-closed: neither the old string nor the new one renders while
              PostHog is still answering, so a non-pilot studio never sees the
              letter flash past. */}
          {letterLoading ? (
            <div className="mt-4 h-[18px]" aria-hidden />
          ) : letterOn ? (
            <>
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
                <input
                  type="checkbox"
                  checked={invite}
                  onChange={(e) => setInvite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
                  aria-label={checkboxLabel(clientGiven)}
                />
                <span>
                  {checkboxLabel(clientGiven)}
                  <span className="mt-0.5 block text-[0.64rem] leading-relaxed text-[var(--color-aged-oak)]">
                    {checkboxHelper({
                      givenName: clientGiven,
                      studioName,
                      pronoun: null,
                    })}
                  </span>
                </span>
              </label>

              <LetterLineField
                facts={{
                  clientName: name.trim() || null,
                  clientEmail: email.trim() || "no email yet",
                  projectName: null,
                }}
                value={note}
                onChange={setNote}
                // Checkbox off folds the field to "+ A line for {given}";
                // opening it turns the letter back on. The key forces a
                // remount on every invite flip so the field's own `open`
                // state can't drift from `folded` after the first render.
                folded={!invite}
                key={invite ? "letter-on" : "letter-off"}
                onOpen={() => setInvite(true)}
              />
            </>
          ) : (
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
              <input
                type="checkbox"
                checked={invite}
                onChange={(e) => setInvite(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
              />
              Send a magic-link invite to Patina
            </label>
          )}

          {onGoToLeads && (
            <p className="mt-3 text-[0.66rem] text-[var(--color-aged-oak)]">
              Not a client yet?{" "}
              <DocumentAction
                actionKey="add-lead-in-pipeline"
                surfaceKey="people"
                regionKey="add-person-sheet"
                variant="tertiary"
                onClick={() => {
                  close();
                  onGoToLeads();
                }}
                className="inline-flex min-h-11 px-0 font-sans normal-case tracking-normal"
              >
                Add a lead in the pipeline
              </DocumentAction>
              .
            </p>
          )}
        </>
      ) : kind === "maker" ? (
        <>
          <label className={FIELD_LABEL}>Maker name</label>
          <input
            type="text"
            value={makerName}
            onChange={(e) => setMakerName(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Specialty <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Orders email{" "}
            <span className="opacity-60">(where POs go · optional)</span>
          </label>
          <input
            type="email"
            value={ordersEmail}
            onChange={(e) => setOrdersEmail(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Website <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className={FIELD_INPUT}
          />
        </>
      ) : (
        <>
          <label className={FIELD_LABEL} htmlFor="add-party-project">
            Project
          </label>
          <select
            id="add-party-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          >
            <option value="">Which project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <p className="mb-4 -mt-2 text-[0.66rem] text-[var(--color-aged-oak)]">
              No active projects yet — field crew join from a live project.
            </p>
          )}

          <label className={FIELD_LABEL} htmlFor="add-party-name">
            Full name
          </label>
          <input
            id="add-party-name"
            type="text"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          />

          {kind === "other_named" && (
            <>
              <label className={FIELD_LABEL} htmlFor="add-party-label">
                What they are to this job
              </label>
              <input
                id="add-party-label"
                type="text"
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                className={`${FIELD_INPUT} mb-4`}
              />
            </>
          )}

          {/* Firm: match one the studio already keeps, or write a new name.
              Two doors, one field group — a firm typed twice is a firm the
              rolodex holds twice. */}
          <label className={FIELD_LABEL} htmlFor="add-party-firm">
            Company
          </label>
          <select
            id="add-party-firm"
            value={firmId}
            onChange={(e) => {
              setFirmId(e.target.value);
              const match = firms.find((f) => f.id === e.target.value);
              if (match) setCompany(match.company_name ?? "");
            }}
            className={`${FIELD_INPUT} mb-2`}
          >
            <option value="">A firm not on this list</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.company_name}
              </option>
            ))}
          </select>
          {!firmId && (
            <input
              type="text"
              aria-label="New company name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={`${FIELD_INPUT} mb-4`}
            />
          )}

          {showsTrade(kind) && (
            <>
              <label className={FIELD_LABEL} htmlFor="add-party-trade">
                Trade
              </label>
              <select
                id="add-party-trade"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className={`${FIELD_INPUT} mb-4`}
              >
                <option value="">Which trade…</option>
                {ALL_FIELD_TRADES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TRADE_LABELS[t]}
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Typed channel rows — a line is a KIND and a value, never a bare
              string, so the person card can print each one with its own
              consent word. */}
          <label className={FIELD_LABEL} htmlFor="add-party-mobile">
            Mobile
          </label>
          <input
            id="add-party-mobile"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL} htmlFor="add-party-email">
            Email
          </label>
          <input
            id="add-party-email"
            type="email"
            value={partyEmail}
            onChange={(e) => setPartyEmail(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          />

          {/* The rule travels with the person, so it is written once here and
              every add, send and edit afterwards honours it (Leah task 1). */}
          <label className={FIELD_LABEL} htmlFor="add-party-rule">
            How to reach them
          </label>
          <input
            id="add-party-rule"
            type="text"
            value={contactRule}
            onChange={(e) => setContactRuleText(e.target.value)}
            className={`${FIELD_INPUT} mb-1`}
          />
          <p className="mb-4 text-[0.66rem] leading-relaxed text-[var(--color-aged-oak)]">
            A sentence, not a setting. &ldquo;Text only. No working
            email.&rdquo;
          </p>

          {/* R-J / C20 / SPEC §5.5 #16 — TWO branches, two exact wordings,
              each with its own act. The field never sits there looking
              pre-filled: it opens from the act, prefilled from the agreement
              where the agreement says something, and empty where it does not. */}
          {agreementClause ? (
            <>
              <p className="text-[0.66rem] leading-relaxed text-[var(--color-aged-oak)]">
                Defaulted from the agreement. Confirm it, or write a different
                one.
              </p>
              <DocumentAction
                actionKey="confirm-authority-from-agreement"
                surfaceKey="people"
                regionKey="add-person-sheet"
                variant="tertiary"
                aria-expanded={authorityOpen}
                aria-controls={authorityFieldId}
                onClick={() => {
                  setAuthorityPhrase((current) => current || agreementClause);
                  setAuthorityOpen(true);
                }}
              >
                Confirm from the agreement
              </DocumentAction>
            </>
          ) : (
            <>
              <p className="text-[0.66rem] leading-relaxed text-[var(--color-aged-oak)]">
                Nothing defaulted from the agreement.
              </p>
              <DocumentAction
                actionKey="record-the-authority"
                surfaceKey="people"
                regionKey="add-person-sheet"
                variant="tertiary"
                aria-expanded={authorityOpen}
                aria-controls={authorityFieldId}
                onClick={() => setAuthorityOpen(true)}
              >
                Record the authority
              </DocumentAction>
            </>
          )}
          <div id={authorityFieldId} hidden={!authorityOpen} className="mb-4">
            {/* CR-12 — the grant is a RECORDED FACT with a scope and, where the
                scope carries money, a figure. Both are written here. */}
            <label className={FIELD_LABEL} htmlFor="add-party-authority-scope">
              What they may decide
            </label>
            <select
              id="add-party-authority-scope"
              value={authorityScope}
              onChange={(e) =>
                setAuthorityScope(e.target.value as AuthorityScope)
              }
              className={`${FIELD_INPUT} mt-1`}
            >
              {ALL_AUTHORITY_SCOPES.map((scope) => (
                <option
                  key={scope}
                  value={scope}
                  disabled={!isOrgAdmin && isAdminOnlyAuthorityScope(scope)}
                >
                  {AUTHORITY_SCOPE_LABELS[scope]}
                </option>
              ))}
            </select>
            {!isOrgAdmin && (
              <p className="mt-1 text-[0.66rem] leading-relaxed text-[var(--color-aged-oak)]">
                Signing money and certifying draws are the studio owner&rsquo;s
                or an admin&rsquo;s to grant.
              </p>
            )}

            <label
              className={`${FIELD_LABEL} mt-3`}
              htmlFor="add-party-authority-threshold"
            >
              Up to, in dollars
            </label>
            <input
              id="add-party-authority-threshold"
              type="text"
              inputMode="decimal"
              value={authorityThreshold}
              onChange={(e) => setAuthorityThreshold(e.target.value)}
              className={`${FIELD_INPUT} mt-1`}
            />
            <p className="mt-1 text-[0.66rem] leading-relaxed text-[var(--color-aged-oak)]">
              Leave it empty where no figure applies. 2500 reads as
              &ldquo;Signs money to $2,500.&rdquo;
            </p>

            <label
              className={`${FIELD_LABEL} mt-3`}
              htmlFor="add-party-authority"
            >
              Authority
            </label>
            <input
              id="add-party-authority"
              type="text"
              value={authorityPhrase}
              onChange={(e) => setAuthorityPhrase(e.target.value)}
              className={`${FIELD_INPUT} mt-1`}
            />
          </div>

          {/* QA-R2-5 / C32 — the checkbox's ACCESSIBLE NAME is the short
              sentence; the disclosure is its DESCRIPTION, outside the label.
              Wrapping the whole paragraph made the box's own name a run-on
              that cannot be scanned by ear, and that run-on contained the word
              "project": every reader (and every locator) asking for "Project"
              then found two controls — the real Project select and this
              consent box. Same rule R-W already set for the company card's
              crew line. */}
          <div className="mt-4 flex items-start gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
            <input
              id="add-party-sms-consent"
              type="checkbox"
              checked={textUpdates}
              onChange={(e) => setTextUpdates(e.target.checked)}
              aria-describedby="add-party-sms-consent-note"
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
            />
            <span>
              <label htmlFor="add-party-sms-consent" className="cursor-pointer">
                They gave prior express consent for text updates
              </label>
              <span
                id="add-party-sms-consent-note"
                className="mt-0.5 block text-[0.64rem] text-[var(--color-aged-oak)]"
              >
                Optional and never preselected. They agreed to Patina project
                texts (~1/day, rates may apply, reply STOP to quit).
              </span>
            </span>
          </div>

          {textUpdates && (
            <div className="mt-4 rounded border border-[var(--color-pearl)] bg-[var(--color-linen)]/45 p-3">
              <label className={FIELD_LABEL} htmlFor="add-party-consent-source">
                How consent was given
              </label>
              <select
                id="add-party-consent-source"
                value={consentSource}
                onChange={(e) =>
                  setConsentSource(
                    e.target.value as
                      | ""
                      | "verbal"
                      | "written"
                      | "web_form"
                      | "other",
                  )
                }
                className={`${FIELD_INPUT} mb-3`}
              >
                <option value="">Choose a method…</option>
                <option value="verbal">Verbal agreement</option>
                <option value="written">Written agreement</option>
                <option value="web_form">Website or form</option>
                <option value="other">Other documented consent</option>
              </select>

              <label
                className={FIELD_LABEL}
                htmlFor="add-party-consent-evidence"
              >
                Where and when they agreed
              </label>
              <textarea
                id="add-party-consent-evidence"
                value={consentEvidence}
                onChange={(e) => setConsentEvidence(e.target.value)}
                rows={3}
                className={`${FIELD_INPUT} resize-none`}
              />
              <p className="mt-2 text-[0.62rem] leading-relaxed text-[var(--color-aged-oak)]">
                Keep the underlying form, message, or signed record. Patina
                stores this note, time, disclosure version, and the person
                recording it.
              </p>
              {/* CR-4: R-AS took both halves off the seat INSERT, so the
                  double opt-in is NOT dispatched from here. Telling the studio
                  to wait for a YES to a message Patina never sent is a
                  consent-adjacent falsehood. Say what is true today; W3's
                  record-side dispatch changes this sentence back.

                  CR3-1: and say the RECORD'S OWN WORD. This sheet's consent
                  door is `record_channel_invite` (00594), which leaves a
                  standing grant alone and otherwise writes `pending` — the
                  word the Directory row, the seat line and the Call Sheet row
                  beside it all print as `Invited`. Claiming consent here while
                  three faces read Invited for the same number is a face/ledger
                  contradiction on a consent surface. */}
              <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--color-mocha)]">
                {partyName.trim() || "They"} is invited, not consenting. Patina
                has not sent them anything yet.
              </p>
            </div>
          )}

          <p
            id="add-party-consequence"
            className="mt-4 max-w-[56ch] text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]"
          >
            {`Adding ${partyName.trim() || "them"} puts ${
              partyName.trim() ? "them" : "them"
            } on the ${
              projects.find((p) => p.id === projectId)?.name ?? "project"
            } Call Sheet and opens a field link for their window. It never opens billing or the agreement.`}
          </p>
        </>
      )}

      {/* QA 2026-09-09: a refused save (a field kind with no project picked)
          printed here and nowhere else, so it read as a no-op. `role="alert"`
          announces it the way the capture sheet's own error channel does. */}
      {error && (
        <p
          role="alert"
          className="mt-3 text-[0.72rem] text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}

      <DocumentActionGroup
        surfaceKey="people"
        regionKey={isEditMode ? "edit-person-sheet" : "add-person-sheet"}
        className="mt-5 border-t border-[var(--color-pearl)] pt-4"
      >
        <DocumentAction
          actionKey={isEditMode ? "save-person" : "add-person"}
          variant={
            isEditMode || kind === "client" || kind === "maker"
              ? "primary"
              : "terminal"
          }
          aria-describedby={
            isSeatKind(kind) ? "add-party-consequence" : undefined
          }
          loading={pending}
          loadingLabel={isEditMode ? "Saving…" : "Adding…"}
          onClick={() => void submit()}
        >
          {isEditMode
            ? "Save"
            : kind === "client" && letterOn && !letterLoading
              ? sendButtonLabel(invite)
              : "Add to the roster"}
        </DocumentAction>
        <DocumentAction
          actionKey={isEditMode ? "cancel-edit-person" : "cancel-add-person"}
          variant="tertiary"
          onClick={close}
        >
          Cancel
        </DocumentAction>
      </DocumentActionGroup>

      {/* Clearance for the fixed Studio drawer (D8, ≥980px, ~60px tall at the
          viewport bottom): keep the action row above it so the tall field-party
          form's buttons stay clickable. */}
      <div aria-hidden className="h-4 min-[980px]:h-20" />
    </RoomSheet>
  );
}
