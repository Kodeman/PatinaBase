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

import { useMemo, useState } from 'react';
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
import { useMobilePrimaryAction } from './mobile/mobile-shell';
import { ClientMirror } from './client-mirror';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';
import { ProposalPreview } from './proposal-preview';

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
}: {
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
}) {
  const router = useRouter();
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const sendNote = useSendDocumentNote(projectId, clientProfileId);
  const { data: scans } = useClientScans(clientProfileId, projectId);
  // Call Sheet instrument — flag-gated at this consumer (never in the
  // registry, per registry.tsx's canon). When off, CallSheetInstrument never
  // mounts, so this row of the letterhead instruments stays byte-identical
  // to before the flag existed.
  const { value: callSheetOn } = useFeatureFlag('call-sheet');

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
  const canMirror = Boolean(projectId || proposalId);
  // "Send a note" needs a thread route: a project group thread, or (pre-project)
  // a direct thread to the client's profile. A profile-less lead has neither.
  const canSendNote = Boolean(projectId || clientProfileId);

  useMobilePrimaryAction(
    canSendNote
      ? {
          actionKey: 'message-family',
          surfaceKey: 'open-document',
          regionKey: 'letterhead-actions',
          label: `Message ${family}`,
          target: { kind: 'press', onPress: () => setComposing((v) => !v) },
        }
      : null,
  );

  return (
    <>
      <DocumentActionGroup
        surfaceKey="open-document"
        regionKey="letterhead-actions"
        className="mt-1"
        aria-label="Document letterhead actions"
      >
        {canSendNote && (
          <DocumentAction
            actionKey="message-family"
            variant="primary"
            onClick={() => setComposing((v) => !v)}
          >
            Message {family}
          </DocumentAction>
        )}
        {canMirror && (
          <DocumentAction
            actionKey="preview-as-client"
            variant="secondary"
            onClick={() => setMirrorOpen(true)}
          >
            Preview as {family}
          </DocumentAction>
        )}
        {scan && (
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
        {projectId && <SharingTierInstrument projectId={projectId} />}
        {projectId && callSheetOn && <CallSheetInstrument projectId={projectId} />}
      </DocumentActionGroup>

      {composing && (
        <div
          className="mt-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-2.5"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setComposing(false);
            }
          }}
        >
          <p className="mb-1.5 text-[10px] italic text-[var(--text-muted)]">
            The Pulse handles Fridays; this is for now. It lands in {clientName}
            &rsquo;s portal messages.
          </p>
          <textarea
            autoFocus
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={3}
            placeholder={`A quick note to ${clientName}…`}
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
              onClick={() => setComposing(false)}
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
          <span className="text-[var(--color-terracotta)]">{onPaperSuffix}</span>
        ) : undefined
      }
    >
      Call sheet · {roster.length}
    </DocumentAction>
  );
}

/**
 * R79 — the sharing-tier instrument. A quiet mono line stating the current
 * tier; clicking unfolds a small paper panel (border + tint, ZERO shadows —
 * D4) with the three tiers. Selecting writes client_visibility_tier through
 * the vitals save channel and folds the panel; failures read inline (R83).
 */
function SharingTierInstrument({ projectId }: { projectId: string }) {
  const { data: project } = useProjectV2(projectId) as { data: any };
  const save = useSaveProjectVitals(projectId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <span className="relative">
      <DocumentAction
        actionKey="sharing-settings"
        variant="tertiary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Sharing · {currentLabel}
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
              <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
                {t.label}
                {t.value === current ? ' · current' : ''}
              </span>
              <span className="block text-[10px] leading-snug text-[var(--text-muted)]">
                {t.desc}
              </span>
            </button>
          ))}
          {error && (
            <span
              role="alert"
              className="block px-2 pb-1 pt-0.5 text-[10px] text-[var(--color-terracotta)]"
            >
              {error}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
