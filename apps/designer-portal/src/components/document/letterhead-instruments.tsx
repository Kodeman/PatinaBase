'use client';

/**
 * The letterhead instruments (R27) — one quiet DM-mono row under the
 * letterhead subtitle:
 *   · View as the [clients] — the client mirror full-screen under a thin
 *     charcoal banner; read-only preview session.
 *   · Send a note — the Pulse's ad-hoc sibling: compose → comms post →
 *     letterhead-anchored message item. No new schema (00193 anchors:
 *     NULL = letterhead).
 *   · The scan — Discovery artifact (iOS RoomPlan capture), opening the Room
 *     View (I74a — `/room/[id]`, the first physical iOS↔portal handshake).
 *   · Sharing tier (R79) — the old wizard's Step06 visibility choice, now a
 *     letterhead instrument on project documents: what the client's mirror
 *     shows (full / milestone / curated) is set where the mirror is opened.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBrowserClient,
  useProjectV2,
  useProjectRoster,
  resolveCoverPhoto,
  publicUrlToPath,
  type RoomScanPhotoRow,
} from '@patina/supabase';
import { invalidateMarginSurfaces } from '@/hooks/use-margin-items';
import { useSaveProjectVitals } from '@/hooks/use-project-lifecycle';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { familyLabel } from '@/lib/document/family-label';
import { vitalsInstrumentSuffix } from '@/lib/document/roster-derivation';
import { clientShortName } from '@/lib/document/document-guide';
import {
  ACT_LANDING_EVENTS,
  ACT_TARGET_IDS,
  MESSAGE_WITHHELD,
  NAMED_ACTS,
  messageLabel,
  messageNoLogin,
  needActLabel,
  type NoLoginRepair,
} from '@/lib/document/act-names';
import {
  standingDoorLabel,
  type LensVoice,
} from '@/lib/document/lens-band-derivation';
import {
  useMobilePrimaryAction,
  useMobileSecondaryAction,
  type MobileSecondaryAction,
} from './mobile/mobile-shell';
import { MOBILE_ACTION_PRIORITY } from './mobile/lifecycle-mobile-action';
import { OPEN_STANDING_SHEET_EVENT } from './lens-band';
import { openVitalsEditor } from './letterhead-vitals';
import { openKeys } from './overlays/keys-sheet';
import { bandNextAct } from './overlays/active-dialog';
import { ClientMirror } from './client-mirror';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';
import { ProposalPreview } from './proposal-preview';
import { HouseholdSheet, useNoLoginRepair } from './overlays/household-sheet';

/** The control focus returns to when the composer is cancelled: whatever was
 *  pressed to open it, or (a Next landing, FR4 Fix 2: Safari does not focus a
 *  pressed button) the act it was pressed from. */
function composerOpener(composer: HTMLElement | null, landing: boolean): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !composer?.contains(active)) {
    return active;
  }
  return landing ? bandNextAct() : null;
}

/** `Elena’s`, `the client’s`; an article-led plural household takes the
 *  bare apostrophe (`the Ashfords’`, FR4 524-b). */
function possessive(name: string): string {
  return /^the\s.*s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** FR4 524-a — reads which invite control the relationship sheet can mount;
 *  mounted only while a relationship paper's Message is held for the login. */
function NoLoginRepairProbe({
  designerClientId,
  onRepair,
}: {
  designerClientId: string;
  onRepair: (control: NoLoginRepair) => void;
}) {
  const control = useNoLoginRepair(designerClientId);
  useEffect(() => onRepair(control), [control, onRepair]);
  return null;
}

/** The three tiers the mirror honors (00084 client_visibility_tier). Copy
 *  ported from the portal's ClientViewToggle. */
const TIERS = [
  {
    value: 'full',
    label: 'Full access',
    desc: 'They see daily progress, every update, photos as they happen.',
  },
  {
    value: 'milestone',
    label: 'Milestones',
    desc: 'Phase-end updates and major decisions only.',
  },
  {
    value: 'curated',
    label: 'Curated',
    desc: 'You publish specific updates; the reveal comes at completion.',
  },
] as const;

const getSupabase = () => createBrowserClient() as any;

interface ScanArtifact {
  id: string;
  name: string | null;
  created_at: string;
  /** The resolved cover photo's SIGNED url (I79/I81) — null when the scan
   *  has no photos, or (defensively) when signing a resolved photo failed. */
  image_url: string | null;
  /** Whose scan this is (Wave 1P, spec §11.2). The instrument says so. */
  owner_kind: 'designer' | 'client';
}

/** The `room_scan_images` columns `resolveCoverPhoto` needs (I81) — embedded
 *  per-scan below. Only ONE photo per scan ever needs signing here (the
 *  resolved cover), so this stays a light multi-scan preview query rather
 *  than pulling in the full per-scan `useRoomScanPhotos` (which fetches
 *  every photo for a single open scan — Room View's job, not this row's). */
type HeroCandidate = Pick<
  RoomScanPhotoRow,
  'image_url' | 'is_primary' | 'quality_score' | 'display_order'
>;

/** The client's ready scans AND the designer's own scans on THIS project
 *  (spec §11.2, Wave 1P).
 *  Before the union a designer could not open her own site scan from her own
 *  project's document. Provenance rides each row so the instrument's label
 *  still says whose scan it is.
 *
 *  `enabled` deliberately still gates on `clientProfileId` (Ruling 4-A): a
 *  lead / proposal / relationship-only document must not start issuing a
 *  room_scans read plus signing calls it never issued before. */
function useClientScans(clientProfileId: string | null, projectId: string | null) {
  return useQuery<ScanArtifact[]>({
    queryKey: ['document-client-scans', clientProfileId, projectId],
    enabled: Boolean(clientProfileId),
    queryFn: async () => {
      const supabase = getSupabase();
      const select =
        'id, name, created_at, images:room_scan_images(image_url, is_primary, quality_score, display_order)';

      const { data: auth } = await supabase.auth.getUser();
      const designerId: string | null = auth?.user?.id ?? null;

      type ScanRow = {
        id: string;
        name: string | null;
        created_at: string;
        images: HeroCandidate[] | null;
      };

      // The client leg keeps its pre-union behaviour byte-for-byte — no status
      // filter — so no scan that showed yesterday disappears today. The NEW
      // designer leg follows the same ready-only rule the Discovery picker uses
      // (useClientRoomScans), so one concept cannot mean two things (Ruling 7-B).
      const readScansFor = async (
        ownerId: string,
        readyOnly: boolean,
        scopedProjectId?: string,
      ): Promise<ScanRow[]> => {
        let query = supabase.from('room_scans').select(select).eq('user_id', ownerId);
        if (readyOnly) query = query.eq('status', 'ready');
        if (scopedProjectId) query = query.eq('project_id', scopedProjectId);
        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(5);
        if (error) throw error;
        return (data ?? []) as ScanRow[];
      };

      // The designer leg is scoped to THIS project (room_scans.project_id,
      // 00265). The column is nullable and an unlinked scan does not qualify —
      // otherwise the door on document C could open a room scanned in client
      // B's house. No project (a lead / proposal / relationship document) means
      // no designer leg, so those documents keep their pre-union behaviour.
      const [clientRows, designerRows] = await Promise.all([
        clientProfileId
          ? readScansFor(clientProfileId, false)
          : Promise.resolve<ScanRow[]>([]),
        designerId && projectId
          ? readScansFor(designerId, true, projectId)
          : Promise.resolve<ScanRow[]>([]),
      ]);

      const byId = new Map<string, ScanRow & { owner_kind: 'designer' | 'client' }>();
      for (const row of clientRows) byId.set(row.id, { ...row, owner_kind: 'client' });
      // The designer leg lands last, so a self-scan reads as hers.
      for (const row of designerRows) byId.set(row.id, { ...row, owner_kind: 'designer' });

      const scans = Array.from(byId.values()).sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );

      // Resolve one cover photo per scan (I81's is_primary → quality →
      // display_order rule — NOT the old ad-hoc "first is_primary or first
      // row" pick), then batch-sign every distinct storage path across all scans
      // (up to 5 per side) in ONE call instead of up to 5 round-trips (I79).
      const heroes = scans.map((s) => resolveCoverPhoto(s.images ?? []));
      const heroPaths = heroes.map((h) =>
        h ? publicUrlToPath(h.image_url) : null,
      );
      const pathsToSign = Array.from(
        new Set(heroPaths.filter((p): p is string => Boolean(p))),
      );

      const signedByPath = new Map<string, string>();
      if (pathsToSign.length > 0) {
        const { data: signedData, error: signError } = await supabase.storage
          .from('room-scans')
          .createSignedUrls(pathsToSign, 3600);
        if (signError) throw signError;
        for (const entry of signedData ?? []) {
          if (entry.path && !entry.error)
            signedByPath.set(entry.path, entry.signedUrl);
        }
      }

      return scans.map((s, i) => {
        const hero = heroes[i];
        const path = heroPaths[i];
        // No hero → no photo. A path that needed signing but isn't in the
        // signed map means that one signing call failed — unresolved, not a
        // throw. No path (but a hero exists) means the raw value was
        // already a usable URL — pass it through unchanged.
        const image_url = !hero
          ? null
          : path
            ? (signedByPath.get(path) ?? null)
            : hero.image_url;
        return {
          id: s.id,
          name: s.name,
          created_at: s.created_at,
          image_url,
          owner_kind: s.owner_kind,
        };
      });
    },
  });
}

/**
 * Open (or reuse) the right thread for an ad-hoc note and post the message.
 * Stage-consistent (R63): a project keys the project group thread; a pre-project
 * document (proposal / relationship) has no project, so it routes to the
 * designer↔client 1:1 DIRECT thread keyed on the client's profile id
 * (rpc_start_direct_thread, 00103) — which needs no project_id.
 */
function useSendDocumentNote(
  projectId: string | null,
  counterpartProfileId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const supabase = getSupabase();
      let threadId: string | null = null;
      if (projectId) {
        const { data, error } = await supabase.rpc('rpc_start_project_thread', {
          p_project_id: projectId,
        });
        if (error) throw error;
        threadId = data;
      } else if (counterpartProfileId) {
        const { data, error } = await supabase.rpc('rpc_start_direct_thread', {
          counterpart: counterpartProfileId,
        });
        if (error) throw error;
        threadId = data;
      } else {
        // No in-app counterpart (a profile-less captured lead) — the button is
        // hidden in this case, so this is a defensive guard, not a UX path.
        throw new Error('No counterpart to send a note to.');
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error: mErr } = await supabase.from('comms_messages').insert({
        thread_id: threadId,
        sender_id: auth?.user?.id ?? null,
        body,
      });
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      // Project documents have a margin to refresh; pre-project ones don't.
      if (projectId) invalidateMarginSurfaces(qc, projectId);
      void qc.invalidateQueries({ queryKey: ['comms'] });
    },
  });
}

export function LetterheadInstruments({
  projectId = null,
  proposalId = null,
  clientProfileId,
  clientName,
  engagementId = null,
  voice = null,
  designerClientId = null,
  proposalStatus = null,
  brief = false,
}: {
  /** US-19 FR4 524-d (`one-voice`) — a Brief paper: Keys and Standing only.
   *  Nothing has been written to the inquirer yet, so no Message (it would
   *  front-run the reply) and no client's copy to preview. */
  brief?: boolean;
  /** US-19 D7 (`one-voice`) — the band's Next and its door, which the phone
   *  dock repeats: the centre is Next's act in the band's words, and More
   *  carries `Standing · N` when the band's measure moved it there. */
  voice?: Pick<LensVoice, 'next' | 'standingCount' | 'doorInDock'> | null;
  /** Set on a project document; null pre-project (proposal / relationship). */
  projectId?: string | null;
  /** Set when a live proposal exists — drives the pre-project client mirror. */
  proposalId?: string | null;
  clientProfileId: string | null;
  clientName: string;
  /** The CURRENT document's own engagement id (A2) — passed through as the
   *  Room View door's `docId`, so a scan whose own canonical document
   *  differs from the one it was opened from still scopes-back to the right
   *  document. Optional: callers that don't yet carry it degrade to the
   *  door's un-scoped canonical-doc fallback. */
  engagementId?: string | null;
  /** US-19 FR2 F2-17 (`one-voice`) — a proposal paper's household, for held
   *  Message's repair: it opens the household sheet the chip opens. FR3 F3-6:
   *  set with no client profile, the household is linked but has no login.
   *  A relationship (Discovery) paper passes its own engagement id. */
  designerClientId?: string | null;
  /** The proposal's status, so that sheet keeps a sent proposal's client. */
  proposalStatus?: string | null;
}) {
  const router = useRouter();
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const sendNote = useSendDocumentNote(projectId, clientProfileId);
  const { data: scans } = useClientScans(clientProfileId, projectId);

  // Ruling 4-B: the client's scan stays the door's first choice, so unioning
  // the designer's own scans never silently retargets an existing document.
  const scan = useMemo(() => {
    const withImage = (scans ?? []).filter((s) => s.image_url);
    return (
      withImage.find((s) => s.owner_kind === 'client') ?? withImage[0] ?? null
    );
  }, [scans]);
  const family = familyLabel(clientName);

  // "View as the client" needs a mirror to open: the full project mirror when
  // there's a project, else the proposal-grain mirror when there's a live
  // proposal. A pure relationship with neither has nothing to mirror — hide it.
  const oneVoice = useFeatureFlag('one-voice').value === true;
  const briefPaper = oneVoice && brief;
  const canMirror = !briefPaper && Boolean(projectId || proposalId);
  // F52 (0a-3) — a linked client is the household chip's own truth: a client
  // profile, or the canonical relationship a captured / no-login household
  // carries. On a project document that relationship rides the project's
  // proposal, read here from the same `project-v2` query the page already holds
  // (page.tsx derives the chip's `designerClientId` the same way).
  const { data: project } = useProjectV2(projectId ?? '') as {
    data: { proposal?: { designer_client_id?: string | null } | null } | undefined;
  };
  const hasClient = Boolean(
    clientProfileId || (projectId && project?.proposal?.designer_client_id),
  );
  // "Send a note" needs a linked client AND a thread route: a project group
  // thread, or (pre-project) a direct thread to the client's profile.
  const canSendNote = !briefPaper && hasClient && Boolean(projectId || clientProfileId);
  // A project with nobody linked still offers Message, held with its reason and
  // the repair beside it (D3 Gated, D7) — never as the dock's centre. FR2
  // F2-17 (`one-voice`): so does a proposal paper with no client to message —
  // none linked, or a household with no login (no thread route). FR3 F3-25:
  // and a relationship paper, which now mounts these with or without a login.
  // FR4 524-d: a Brief paper offers no Message at all, held or live.
  const messageHeld =
    !briefPaper &&
    ((Boolean(projectId) && !hasClient) || (oneVoice && !projectId && !canSendNote));
  const [linking, setLinking] = useState(false);
  const messageReasonId = useId();

  const firstName = family === 'the client' ? null : clientShortName(family);
  const spokenName = firstName ?? 'the client';
  // FR3 F3-6 — a linked household with no login is held for the login, not
  // the link: `Elena has no login yet.` / `Invite Elena`. `Link a client
  // first.` stays for a paper with no household linked at all.
  const noLogin = oneVoice && messageHeld && Boolean(designerClientId);
  // FR4 524-a — on a relationship paper the repair lands in the household
  // sheet's invite row, so it is offered only when that row can mount, in
  // that row's words (`Write to …` for the letter); otherwise Message is held
  // with no repair. Proposal papers keep the picker's `Invite …`.
  const relationshipNoLogin = noLogin && !projectId && !proposalId;
  const [noLoginRepair, setNoLoginRepair] = useState<NoLoginRepair>(null);
  const withheld = noLogin
    ? messageNoLogin(firstName, relationshipNoLogin ? noLoginRepair : 'invite')
    : MESSAGE_WITHHELD;
  const heldLabel = messageLabel(noLogin ? firstName : null);

  // US-19 F3-2 (one-voice, P-2) — `Nudge {first}` lands here: the composer
  // opens with focus in its note and names the overdue decisions above it.
  // Taken only where a note can be sent; a held Message keeps the old landing.
  const [named, setNamed] = useState<readonly string[]>([]);
  // FR6 F6-1 (D1-c) — the act a landing was pressed as; null when the
  // letterhead's own Message opened the composer.
  const [landedAct, setLandedAct] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!composing) {
      setNamed([]);
      setLandedAct(null);
    }
  }, [composing]);
  // FR4 Fix 2 (`one-voice`, design-review-3 §4) — the act that opened the
  // composer, so Esc (Cancel) puts focus back on it.
  const openerRef = useRef<HTMLElement | null>(null);
  const rememberOpener = (landing: boolean) => {
    openerRef.current = oneVoice ? composerOpener(composerRef.current, landing) : null;
  };
  // Read through a ref: the dock may hold an earlier render's press.
  const composingRef = useRef(composing);
  composingRef.current = composing;
  const toggleComposer = () => {
    if (!composingRef.current) rememberOpener(false);
    setComposing((v) => !v);
  };
  const openComposer = () => {
    rememberOpener(false);
    setLandedAct(null);
    setComposing(true);
  };
  const cancelComposer = () => {
    setComposing(false);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!oneVoice || !canSendNote) return;
    const onCompose = (event: Event) => {
      event.preventDefault();
      const detail = (
        event as CustomEvent<{ named?: readonly string[]; act?: string } | undefined>
      ).detail;
      setNamed(detail?.named ?? []);
      // Every landing that names no act is a `Nudge` row (the sheet's).
      setLandedAct(detail?.act ?? needActLabel('overdue_decision', firstName));
      openerRef.current = composerOpener(composerRef.current, true);
      setComposing(true);
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView?.({ block: 'center' });
        noteRef.current?.focus({ preventScroll: true });
      });
    };
    window.addEventListener(ACT_LANDING_EVENTS.composeMessage, onCompose);
    return () => window.removeEventListener(ACT_LANDING_EVENTS.composeMessage, onCompose);
  }, [oneVoice, canSendNote, firstName]);

  useMobilePrimaryAction(
    canSendNote
      ? {
          actionKey: 'message-family',
          surfaceKey: 'open-document',
          regionKey: 'letterhead-actions',
          label: oneVoice ? messageLabel(firstName) : `Message ${family}`,
          target: { kind: 'press', onPress: toggleComposer },
        }
      : null,
  );

  // US-19 D7 — under `one-voice` the dock's centre is the band's Next, in the
  // band's exact words, at the top priority; it wraps, never shortens. Message
  // keeps its quiet registration above, so it stands in only when no Next does.
  const next = oneVoice ? (voice?.next ?? null) : null;
  useMobilePrimaryAction(
    next
      ? {
          actionKey: `next:${next.act.key}`,
          surfaceKey: 'open-document',
          regionKey: 'lens-band',
          label: next.act.label,
          target: { kind: 'press', onPress: () => next.act.onAct() },
          disabled: next.act.disabled,
          // FR3 F3-5 — ⌘K prints this act with the band's sentence.
          sentence: next.sentence,
        }
      : null,
    { priority: MOBILE_ACTION_PRIORITY.next },
  );

  // D7 — More, in its ruled order. `Standing · N` leads when the band's
  // measure moved the door into the dock (D2 at 390).
  const [sharingAsk, setSharingAsk] = useState(0);
  const dockActs: MobileSecondaryAction[] = oneVoice
    ? [
        ...(voice?.doorInDock && voice.standingCount > 0
          ? [
              {
                actionKey: 'standing',
                label: standingDoorLabel(voice.standingCount),
                onPress: () =>
                  window.dispatchEvent(new Event(OPEN_STANDING_SHEET_EVENT)),
              },
            ]
          : []),
        ...(canSendNote
          ? [
              {
                actionKey: 'message-family',
                label: messageLabel(firstName),
                onPress: openComposer,
              },
            ]
          : messageHeld
            ? [
                {
                  actionKey: 'message-family',
                  label: heldLabel,
                  onPress: () => {},
                  held: {
                    reason: withheld.reason,
                    ...(withheld.repair && {
                      repair: {
                        label: withheld.repair,
                        onPress: () => setLinking(true),
                      },
                    }),
                  },
                },
              ]
            : []),
        ...(canMirror
          ? [
              {
                actionKey: 'preview-as-client',
                label: "Preview the client's copy",
                onPress: () => setMirrorOpen(true),
              },
            ]
          : []),
        ...(projectId
          ? [
              {
                actionKey: 'sharing-settings',
                label: 'Sharing',
                onPress: () => setSharingAsk((n) => n + 1),
              },
              {
                actionKey: 'open-call-sheet',
                label: 'Call sheet',
                onPress: () =>
                  window.dispatchEvent(
                    new CustomEvent('document:open-call-sheet', {
                      detail: { mode: 'sheet' },
                    }),
                  ),
              },
              {
                actionKey: 'set-dates',
                label: 'Set dates',
                onPress: () => openVitalsEditor('target'),
              },
              {
                actionKey: 'set-budget-band',
                label: 'Set a budget band',
                onPress: () => openVitalsEditor('budget'),
              },
            ]
          : []),
        { actionKey: 'keys', label: 'Keys', onPress: () => openKeys('drawer') },
      ].map((act, order) => ({ ...act, order }))
    : [];

  return (
    <>
      {dockActs.map((act) => (
        <DockAct key={act.actionKey} action={act} />
      ))}
      {/* FR4 524-d — a Brief's ledger has nothing to print: Standing is the
          band's door and Keys the paper's own `?`; the dock carries both. */}
      {!briefPaper && (
      <DocumentActionGroup
        surfaceKey="open-document"
        regionKey="letterhead-actions"
        // W3-R5 §2 — the ledger's own register. Below 1180 the four acts at
        // 12px/0.1em measure 385px in a 327px run and can never be one row, so
        // the ledger drops to the paper's 11px mono floor (7.5 px/char → 303px,
        // one row inside 327). A descendant selector because `DocumentAction`'s
        // own `text-[12px]` is a single class: `.parent .da-act` (0,2,0) beats
        // it, where a `text-[11px]` passed down as `className` would race it in
        // the stylesheet. The 44px target is `min-h`, untouched by either.
        // No top margin of its own: the letterhead grid's `gap-y` already
        // separates row 2 from the title at ≥1180, and stacks it under the
        // vitals with the same gap below it.
        // W3-R6 §2 — and the gap between the acts drops from `gap-x-3` (13.5px
        // at the 18px root) to the band's own 9px below 1180, the last 13.5px
        // the row needed to fit 327. An attribute-qualified selector, (0,2,0),
        // so it beats `ActionRegionFrame`'s own single-class `gap-x-3` on
        // specificity rather than on stylesheet order.
        // F4 — while Message is held its column is taller than one act, so the
        // row tops its acts rather than centring them on the reason's line.
        className={`[&_.da-act]:text-[11px] min-[1180px]:[&_.da-act]:text-[12px] max-[1179px]:[&[data-action-region]]:gap-x-[9px]${
          messageHeld ? ' [&[data-action-region]]:items-start' : ''
        }`}
        aria-label="Document letterhead actions"
      >
        {/* W3-R4: the family word is dropped from the PRINT at every width —
            the household chip says it 20px above, and repeating it cost the
            ledger ~200px it was taking out of the title's measure. The
            accessible name keeps the whole sentence. */}
        {(messageHeld || canSendNote) && (
          <MessageCluster
            held={messageHeld}
            reason={withheld.reason}
            repair={withheld.repair}
            reasonId={messageReasonId}
            onRepair={() => setLinking(true)}
          >
            {/* F2-9 (`one-voice`) — the letterhead prints D1's names at every
                width, so the accessible name is the printed one. */}
            <DocumentAction
              // FR6 F6-1 (D1-a) — the sent proposal's `Nudge {first}` lands
              // here when no composer takes it: still a control.
              id={oneVoice ? ACT_TARGET_IDS.proposalNudge : undefined}
              actionKey="message-family"
              variant="primary"
              aria-label={
                messageHeld
                  ? heldLabel
                  : oneVoice
                    ? undefined
                    : `Message ${family}`
              }
              disabled={messageHeld}
              held={messageHeld}
              aria-describedby={messageHeld ? messageReasonId : undefined}
              onClick={toggleComposer}
            >
              {messageHeld
                ? heldLabel
                : oneVoice
                  ? messageLabel(firstName)
                  : 'Message'}
            </DocumentAction>
          </MessageCluster>
        )}
        {canMirror && (
          <DocumentAction
            actionKey="preview-as-client"
            variant="secondary"
            aria-label={oneVoice ? undefined : `Preview as ${family}`}
            onClick={() => setMirrorOpen(true)}
          >
            {oneVoice ? NAMED_ACTS.preview : 'Preview'}
          </DocumentAction>
        )}
        {scan && !briefPaper && (
          <DocumentAction
            actionKey="open-client-scan"
            variant="tertiary"
            onClick={() =>
              router.push(
                `/room/${scan.id}?from=document${engagementId ? `&docId=${engagementId}` : ''}`,
              )
            }
          >
            {scan.owner_kind === 'designer' ? 'Your scan' : 'The scan'}
          </DocumentAction>
        )}
        {projectId && (
          <SharingTierInstrument projectId={projectId} openAsk={sharingAsk} />
        )}
        {projectId && <CallSheetInstrument projectId={projectId} />}
      </DocumentActionGroup>
      )}

      {/* The repair opens the same sheet the household chip opens — mounted
          only while open, so a client-less page issues none of its reads. */}
      {messageHeld && linking && (projectId || proposalId || designerClientId) && (
        <HouseholdSheet
          open
          onClose={() => setLinking(false)}
          engagementKind={projectId ? 'project' : proposalId ? 'proposal' : 'relationship'}
          projectId={projectId}
          proposalId={proposalId}
          clientProfileId={null}
          designerClientId={designerClientId}
          clientName={clientName}
          proposalStatus={proposalStatus}
          landOnRepair
        />
      )}
      {relationshipNoLogin && designerClientId && (
        <NoLoginRepairProbe designerClientId={designerClientId} onRepair={setNoLoginRepair} />
      )}

      {composing && (
        <div
          ref={composerRef}
          // An open thing (529-6): a visible log-time offer yields Esc on
          // <body> to it rather than discarding its entry.
          data-open-thing=""
          className="mt-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-2.5"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // F3-1 — marked as taken: the paper's put-down shares the
              // document with React, so stopPropagation alone cannot keep it.
              e.preventDefault();
              e.stopPropagation();
              // FR4 Fix 2 — Esc is Cancel: focus goes back to the act pressed.
              cancelComposer();
            }
          }}
        >
          {/* FR6 F6-1 (D1-c, `one-voice`) — the eyebrow names the act that
              opened the composer: `NUDGE MEI` or `MESSAGE MEI`. */}
          {oneVoice && (
            <p
              data-composer-eyebrow
              className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
            >
              {landedAct ?? messageLabel(firstName)}
            </p>
          )}
          {/* FR4 Fix 2 (`one-voice`) — the helper line and the placeholder go
              through the `Waiting on` line's name guard: a seeded `Client
              User` reads `the client`. */}
          {oneVoice ? (
            <p className="mb-1.5 text-[11px] italic text-[var(--text-muted)]">
              {`The Pulse handles Fridays; this is for now. It lands in ${possessive(spokenName)} portal messages.`}
            </p>
          ) : (
            <p className="mb-1.5 text-[11px] italic text-[var(--text-muted)]">
              The Pulse handles Fridays; this is for now. It lands in {clientName}
              &rsquo;s portal messages.
            </p>
          )}
          {named.length > 0 && (
            <p data-message-named className="mb-1.5 text-[12px] text-[var(--color-charcoal)]">
              {`Waiting on ${spokenName}: ${named.join(' · ')}`}
            </p>
          )}
          <textarea
            ref={noteRef}
            autoFocus
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={3}
            placeholder={`A quick note to ${oneVoice ? spokenName : clientName}…`}
            className="w-full resize-y bg-transparent text-[12px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
          />
          <DocumentActionRow
            surfaceKey="open-document"
            regionKey="letterhead-message"
            className="mt-1"
            aria-label="Message actions"
          >
            <DocumentAction
              actionKey="send-message"
              variant="primary"
              disabled={!noteBody.trim()}
              loading={sendNote.isPending}
              loadingLabel="Sending…"
              onClick={() => {
                sendNote.mutate(noteBody.trim());
                setNoteBody('');
                setComposing(false);
              }}
            >
              Send
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-message"
              variant="tertiary"
              onClick={cancelComposer}
            >
              Cancel
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      {mirrorOpen &&
        (projectId ? (
          <ClientMirror
            projectId={projectId}
            clientName={clientName}
            onClose={() => setMirrorOpen(false)}
          />
        ) : proposalId ? (
          // Pre-project: the proposal-grain mirror (R43/R63) — the same
          // full-screen layer the proposal instruments open from inside the
          // Proposal section, so the two "view as them" affordances read alike.
          <ProposalPreview
            proposalId={proposalId}
            clientName={clientName}
            onClose={() => setMirrorOpen(false)}
          />
        ) : null)}
    </>
  );
}

/** One D7 act published into the dock's More; renders nothing. */
/**
 * FR1 F4 (R15, R16) — the held act prints its accessible name, and its reason
 * stands directly beneath it in the act's own column, left edge on the label's
 * (the act's own `px-[6px]`); the repair stands beside it. The cluster wraps as
 * one, so at 390 the reason still follows its own act. `gap-x-[inherit]` keeps
 * the row's gap. Live, the act stands alone.
 */
function MessageCluster({
  held,
  reason,
  repair,
  reasonId,
  onRepair,
  children,
}: {
  held: boolean;
  /** The real blocking condition (F3-6): no household linked, or no login. */
  reason: string;
  /** null — held with no repair (FR4 524-a): never a door into an empty room. */
  repair: string | null;
  reasonId: string;
  onRepair: () => void;
  children: ReactNode;
}) {
  if (!held) return <>{children}</>;
  return (
    <span className="inline-flex items-start gap-x-[inherit]">
      <span className="inline-flex flex-col items-start">
        {children}
        <span id={reasonId} className="px-[6px] text-[11.5px] leading-tight text-[var(--text-muted)]">
          {reason}
        </span>
      </span>
      {repair && (
        <DocumentAction actionKey="link-client" variant="secondary" onClick={onRepair}>
          {repair}
        </DocumentAction>
      )}
    </span>
  );
}

function DockAct({ action }: { action: MobileSecondaryAction }) {
  useMobileSecondaryAction(action);
  return null;
}

/**
 * The Call Sheet instrument (Wave 3) — "CALL SHEET · N", plus a terracotta
 * mono "· N ON PAPER" tail when someone on the job is only reachable by
 * phone. Both counts come straight off `v_project_roster` via
 * `useProjectRoster` + roster-derivation's `vitalsInstrumentSuffix` (the same
 * rows the sheet itself reads) — no separate count model, no derived state
 * here. Clicking dispatches `document:open-call-sheet`; the sheet is mounted
 * once on /doc/[id] and listens (same event-doorway pattern as the ledgers'
 * own open-* events).
 */
function CallSheetInstrument({ projectId }: { projectId: string }) {
  const { data: rosterRows } = useProjectRoster(projectId);
  const roster = rosterRows ?? [];
  const onPaperSuffix = vitalsInstrumentSuffix(roster);

  return (
    <DocumentAction
      actionKey="open-call-sheet"
      variant="tertiary"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('document:open-call-sheet'));
      }}
      trailing={
        onPaperSuffix ? (
          <span className="text-[var(--color-terracotta-ink)]">{onPaperSuffix}</span>
        ) : undefined
      }
      // W3-R6 §1 — the count is dropped from the PRINT below 1180, so the
      // accessible name has to carry it: the four characters ` · N` are what a
      // 327px run cannot afford, and the ledger's second row cost 44px of the
      // 390 letterhead. CSS, not a viewport read — nothing in this letterhead
      // measures the window in JS (N-03).
      aria-label={`Call sheet · ${roster.length}`}
    >
      Call sheet
      <span className="max-[1179px]:hidden"> · {roster.length}</span>
    </DocumentAction>
  );
}

/**
 * R79 — the sharing-tier instrument. A quiet mono line stating the current
 * tier; clicking unfolds a small paper panel (border + tint, ZERO shadows —
 * D4) with the three tiers. Selecting writes client_visibility_tier through
 * the vitals save channel and folds the panel; failures read inline (R83).
 */
function SharingTierInstrument({
  projectId,
  openAsk = 0,
}: {
  projectId: string;
  /** D7 — each increment is the dock's `Sharing` asking the panel open. */
  openAsk?: number;
}) {
  const { data: project } = useProjectV2(projectId) as { data: any };
  const save = useSaveProjectVitals(projectId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (openAsk === 0) return;
    anchorRef.current?.scrollIntoView?.({ block: 'center' });
    setOpen(true);
  }, [openAsk]);

  const current = (project?.client_visibility_tier ??
    'milestone') as (typeof TIERS)[number]['value'];
  const currentLabel = TIERS.find((t) => t.value === current)?.label ?? current;

  const choose = (tier: (typeof TIERS)[number]['value']) => {
    setError(null);
    if (tier === current) {
      setOpen(false);
      return;
    }
    save.mutate(
      { client_visibility_tier: tier },
      {
        onSuccess: () => setOpen(false),
        onError: (err) =>
          setError(
            err instanceof Error
              ? err.message
              : 'Could not change the tier. Try again.',
          ),
      },
    );
  };

  return (
    <span ref={anchorRef} className="relative">
      {/* W3-R5 §1: this ONE act is both "sharing" and its tier — there is no
          separate MILESTONES instrument to fold. It prints the bare word at
          EVERY width: the tier is state the panel below prints one press away,
          and on the letterhead it is the only label that costs a second row.
          The accessible name states it at every width. */}
      <DocumentAction
        actionKey="sharing-settings"
        variant="tertiary"
        aria-expanded={open}
        aria-label={`Sharing · ${currentLabel}`}
        onClick={() => setOpen((v) => !v)}
      >
        Sharing
      </DocumentAction>
      {open && (
        <span
          className="absolute left-0 top-full z-20 mt-1.5 block w-64 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-1.5"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {TIERS.map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={save.isPending}
              onClick={() => choose(t.value)}
              className={`block w-full rounded-[3px] px-2 py-1.5 text-left transition-colors hover:bg-[rgba(196,165,123,0.08)] disabled:opacity-50 ${
                t.value === current ? 'bg-[rgba(196,165,123,0.1)]' : ''
              }`}
            >
              <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
                {t.label}
                {t.value === current ? ' · current' : ''}
              </span>
              <span className="block text-[11px] leading-snug text-[var(--text-muted)]">
                {t.desc}
              </span>
            </button>
          ))}
          {error && (
            <span
              role="alert"
              className="block px-2 pb-1 pt-0.5 text-[11px] text-[var(--color-terracotta-ink)]"
            >
              {error}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
