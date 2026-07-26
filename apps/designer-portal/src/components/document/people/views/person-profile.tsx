'use client';

/**
 * Person Profile (R51 / Track B) — the role-adaptive profile centred on the
 * derived Relationship Journey. One component, branching by role:
 *
 *  · client      → Style DNA + the woven journey + Projects / Trust & history /
 *    Nurture / Private-note side cards; actions Message, Schedule a touchpoint,
 *    View as them (the client mirror).
 *  · maker       → MakerProfile (../profile/maker-profile, R78/PRC-02): products
 *    carried, reviews, request-a-quote, roster save/unsave, and the Orders-book
 *    cross-link. Renders even for a maker not yet on the roster (the
 *    marketplace lens walks in pre-admission), so it loads from the vendor
 *    book, not the directory view.
 *  · gc          → the (sparser) journey + Engagements / Track record cards +
 *    a cross-link to the coordination view — we link, never rebuild.
 *  · team        → the margin-visibility colophon: which documents the teammate
 *    sees, their studio role, no Style DNA / nurture.
 *
 * The journey is a DERIVATION (deriveRelationshipJourney) over the person's
 * existing proposals, projects, decisions, threads, touchpoints, and reviews —
 * never a stored activity log (R51). Reuses Avatar/RoleBadge from person-bits.
 * Zero shadows (D4), strict focus (D1), typography-first.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useClient,
  useClientDecisions,
  useClientProjects,
  useClientReviews,
  useNurtureTouchpoints,
  usePerson,
  useProposals,
  useStartDirectThread,
  useThreads,
  type ClientDecision,
  type PartyRole,
} from '@patina/supabase';
import { usePersonDocuments } from '@/hooks/use-person-documents';
import {
  deriveRelationshipJourney,
  deriveStatusDot,
  humanizeSince,
  isNurtureDue,
  roleLabel,
  type JourneyInputs,
} from '@/lib/document/people-derivation';
import type { PersonProfileProps } from '../types';
import { ActionButton, BackLink, ProfileHead } from '../profile/profile-shell';
import { MakerProfile } from '../profile/maker-profile';
import { RelationshipJourney } from '../profile/relationship-journey';
import { StyleDna } from '../profile/style-dna';
import {
  NoteCard,
  NurtureCard,
  ProjectsCard,
  TrustCard,
  type ProfileProjectRow,
} from '../profile/profile-cards';

/** The winning option's label on a resolved selection decision, if any. */
function chosenLabel(d: ClientDecision): string | null {
  const opts = d.options ?? [];
  const winner = opts.find((o) => o.selected);
  return winner?.name ?? null;
}

// ─── CLIENT profile ─────────────────────────────────────────────────────────

function ClientProfile({
  personId,
  profileId,
  role,
  name,
  email,
  phone,
  statusRaw,
  lastTouchAt,
  meta,
  onBack,
  openThread,
  notify,
}: {
  personId: string;
  profileId: string | null;
  role: PartyRole;
  name: string;
  email: string | null;
  phone: string | null;
  statusRaw: string | null;
  lastTouchAt: string | null;
  meta: Record<string, unknown>;
  onBack: () => void;
  openThread: (id: string) => void;
  notify: (m: string) => void;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  // Touchpoints and reviews are keyed on `designer_client_id`, so we scope the
  // fetch server-side (P2). Only a real client has a `designer_clients.id` —
  // `personId` for a lead is a lead id, so we gate on the role and skip the
  // filter for leads (the hook then returns nothing, which is correct).
  const designerClientId = role === 'client' ? personId : undefined;

  const { data: client } = useClient(personId);
  const { data: projects } = useClientProjects(personId);
  // The Projects card's document list (I63/T2): document_state rows for this
  // person, resolved by profile for login clients OR through the
  // designer_clients relationship for no-login households — see
  // use-person-documents.ts for the two-shape contract.
  const { data: documents } = usePersonDocuments(personId, profileId);
  const { data: proposals } = useProposals(
    profileId ? { clientId: profileId } : undefined,
  );
  const { data: decisions } = useClientDecisions(personId);
  const { data: allThreads } = useThreads({ scope: 'inbox' });
  const { data: touchpoints } = useNurtureTouchpoints(
    designerClientId ? { designerClientId } : undefined,
  );
  const { data: reviews } = useClientReviews(
    designerClientId ? { designerClientId } : undefined,
  );
  const startDirect = useStartDirectThread();

  // Threads with this person as a participant (profile_id match). Threads have
  // no `designer_client_id`, so this match stays client-side on profile_id.
  const threads = useMemo(() => {
    if (!profileId) return [];
    return (allThreads ?? []).filter((t) =>
      (t.participants ?? []).some((p) => p.profile_id === profileId),
    );
  }, [allThreads, profileId]);

  const touchpointList = touchpoints ?? [];
  const reviewList = reviews ?? [];

  const journey = useMemo(() => {
    const inputs: JourneyInputs = {
      person: {
        person_id: personId,
        role,
        display_name: name,
        email,
        phone,
        profile_id: profileId,
        project_id: null,
        designer_id: null,
        status_raw: statusRaw,
        last_touch_at: lastTouchAt,
        meta,
      },
      // Guard on profileId: useProposals(undefined) returns ALL the designer's
      // proposals (RLS is designer-scoped, not client-scoped). A profileless
      // lead/client must NOT inherit unrelated proposals into its journey.
      proposals: !profileId
        ? []
        : (proposals ?? []).map((p) => {
            // `signed_at` lives on the raw row (select('*')) but isn't on the typed
            // Proposal shape; fall back to responded_at when the proposal is accepted.
            const rawSigned =
              (p as { signed_at?: string | null }).signed_at ?? null;
            const signedAt =
              rawSigned ?? (p.status === 'accepted' ? p.responded_at : null);
            return {
              id: p.id,
              title: p.title,
              status: p.status,
              created_at: p.created_at,
              sent_at: p.sent_at,
              signed_at: signedAt,
              total_cents:
                typeof p.total_amount === 'number'
                  ? Math.round(p.total_amount * 100)
                  : null,
            };
          }),
      projects: (projects ?? []).map((pj: Record<string, unknown>) => ({
        id: pj['id'] as string,
        name: (pj['name'] as string) ?? 'Project',
        status: (pj['status'] as string) ?? null,
        created_at: (pj['created_at'] as string) ?? null,
        kickoff_date: (pj['kickoff_date'] as string) ?? null,
        completed_at: (pj['completed_at'] as string) ?? null,
      })),
      decisions: (decisions ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        created_at: d.created_at,
        resolved_at: d.responded_at,
        chosen_label: chosenLabel(d),
      })),
      threads: threads.map((t) => ({
        id: t.id,
        subject: t.title,
        message_count: null,
        last_message_at: t.last_message_at,
      })),
      touchpoints: touchpointList.map((t) => ({
        id: t.id,
        touchpoint_type: t.touchpoint_type,
        status: t.status,
        reason: t.reason,
        suggested_date: t.suggested_date,
        created_at: t.created_at,
      })),
      reviews: reviewList.map((r) => ({
        id: r.id,
        rating: r.rating,
        review_text: r.review_text,
        created_at: r.created_at,
      })),
    };
    return deriveRelationshipJourney(inputs, now);
  }, [
    personId,
    role,
    name,
    email,
    phone,
    profileId,
    statusRaw,
    lastTouchAt,
    meta,
    proposals,
    projects,
    decisions,
    threads,
    touchpointList,
    reviewList,
    now,
  ]);

  // Side-card rows: the Projects card lists this person's document_state
  // rows (I63/T2 — "documents appear under Projects"), not the raw
  // `projects` table alone, so a no-login household's Discovery/proposal
  // document shows here even though it has no `projects` row yet. Each row
  // opens `/doc/{engagement_id}` — the document resolver accepts any of a
  // document's keys (project/proposal/lead/relationship id).
  const projectRows: ProfileProjectRow[] = useMemo(
    () =>
      (documents ?? []).map((doc) => ({
        id: doc.engagement_id,
        name: doc.title,
        state: doc.active_section,
      })),
    [documents],
  );

  const trust = useMemo(
    () => buildClientTrust(client, reviewList.length),
    [client, reviewList.length],
  );

  const due = isNurtureDue(
    {
      person_id: personId,
      role,
      display_name: name,
      email,
      phone,
      profile_id: profileId,
      project_id: null,
      designer_id: null,
      status_raw: statusRaw,
      last_touch_at: lastTouchAt,
      meta,
    },
    now,
  );
  const dot = deriveStatusDot(
    {
      person_id: personId,
      role,
      display_name: name,
      email,
      phone,
      profile_id: profileId,
      project_id: null,
      designer_id: null,
      status_raw: statusRaw,
      last_touch_at: lastTouchAt,
      meta,
    },
    now,
  );
  const nurtureText = nurtureLine(statusRaw, lastTouchAt, now, due, dot);

  const onMessage = () => {
    if (!profileId) {
      notify(
        `${name} has no portal login yet — invite them to start a direct thread.`,
      );
      return;
    }
    const existing = threads[0];
    if (existing) {
      openThread(existing.id);
      return;
    }
    startDirect.mutate(profileId, {
      onSuccess: (threadId) => openThread(threadId),
      onError: () =>
        notify(`Couldn't open a thread with ${name} just now — try again.`),
    });
  };

  const firstName = name.split(' ')[0] ?? name;

  return (
    <>
      <BackLink onBack={onBack} />
      <ProfileHead
        name={name}
        role={role}
        email={email}
        phone={phone}
        actions={
          <>
            <ActionButton
              actionKey="message-person"
              label="Message"
              tone="dark"
              onClick={onMessage}
            />
            <ActionButton
              actionKey="schedule-touchpoint"
              label="Schedule a touchpoint"
              onClick={() =>
                notify(
                  `Composing a touchpoint for ${firstName} — pick a template (check-in, holiday, milestone) and a send time. Nurture keeps the relationship warm.`,
                )
              }
            />
            <ActionButton
              actionKey="preview-as-person"
              label="View as them"
              onClick={() =>
                notify(
                  `Opens the client mirror — what ${firstName} sees of this relationship.`,
                )
              }
            />
          </>
        }
      />

      <div className="mt-[1.3rem] grid grid-cols-1 gap-7 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <StyleDna
            tags={client?.style_tags ?? (meta['style_tags'] as string[]) ?? []}
            preferences={client?.style_preferences ?? null}
            narrative={client?.inspiration_quote ?? null}
          />
          <RelationshipJourney
            events={journey}
            onFollow={(href) => router.push(href)}
          />
        </div>
        <div>
          <NurtureCard text={nurtureText} due={due} onReachOut={onMessage} />
          <ProjectsCard
            title="Projects"
            projects={projectRows}
            onOpenProject={(id) => router.push(`/doc/${id}`)}
            emptyLine="No projects yet — they open here as you start work together."
          />
          <TrustCard title="Trust & history" items={trust} />
          <NoteCard note={client?.notes ?? null} />
        </div>
      </div>
    </>
  );
}

/** Trust & history lines, drawn from the real client row + review count. */
function buildClientTrust(
  client: ReturnType<typeof useClient>['data'],
  reviewCount: number,
): string[] {
  const out: string[] = [];
  if (client) {
    if (client.total_projects > 0)
      out.push(
        `${client.total_projects} ${client.total_projects === 1 ? 'project' : 'projects'} together`,
      );
    if (client.total_revenue > 0)
      out.push(
        `$${Math.round(client.total_revenue).toLocaleString('en-US')} in lifetime work`,
      );
    if (
      typeof client.satisfaction_score === 'number' &&
      client.satisfaction_score > 0
    )
      out.push(`Satisfaction ${client.satisfaction_score.toFixed(1)} / 5`);
    if (client.source === 'referral') out.push('Came by referral');
  }
  if (reviewCount > 0)
    out.push(
      `${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'} collected`,
    );
  if (out.length === 0) out.push('First engagement — building trust');
  return out;
}

/** The Nurture card's one line, honest to status + dormancy. */
function nurtureLine(
  statusRaw: string | null,
  lastTouchAt: string | null,
  now: Date,
  due: boolean,
  dot: string,
): string {
  if (statusRaw === 'proposal')
    return 'Proposal out — a nudge or a call may be overdue.';
  if (statusRaw === 'lead')
    return 'New relationship — open the conversation within a day.';
  if (statusRaw === 'completed' || statusRaw === 'nurture') {
    if (due)
      return `${humanizeSince(lastTouchAt, now)} since last touch — the Engine recommends reconnecting now.`;
    if (dot === 'warm')
      return `Drifting a little — last touched ${humanizeSince(lastTouchAt, now)}. Worth a check-in soon.`;
    return 'A completed relationship — keep it warm with the occasional note.';
  }
  return 'On an active project together — the relationship is live.';
}

// ─── MAKER / GC profile (network) ───────────────────────────────────────────

function NetworkProfile({
  personId,
  role,
  name,
  email,
  phone,
  projectId,
  statusRaw,
  lastTouchAt,
  meta,
  onBack,
  notify,
}: {
  personId: string;
  role: PartyRole;
  name: string;
  email: string | null;
  phone: string | null;
  projectId: string | null;
  statusRaw: string | null;
  lastTouchAt: string | null;
  meta: Record<string, unknown>;
  onBack: () => void;
  notify: (m: string) => void;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  // A network party's journey is sparse: the project they're engaged on (when
  // project-scoped, as GCs are) is the spine. No proposals / decisions / DNA.
  const journey = useMemo(() => {
    const projectName = (meta['project_name'] as string) ?? null;
    const inputs: JourneyInputs = {
      person: {
        person_id: personId,
        role,
        display_name: name,
        email,
        phone,
        profile_id: null,
        project_id: projectId,
        designer_id: null,
        status_raw: statusRaw,
        last_touch_at: lastTouchAt,
        meta,
      },
      projects:
        projectId && projectName
          ? [
              {
                id: projectId,
                name: projectName,
                status: 'active',
                kickoff_date: lastTouchAt,
              },
            ]
          : [],
    };
    return deriveRelationshipJourney(inputs, now);
  }, [
    personId,
    role,
    name,
    email,
    phone,
    projectId,
    statusRaw,
    lastTouchAt,
    meta,
    now,
  ]);

  const track = buildNetworkTrack(role, meta);
  const projectRows: ProfileProjectRow[] = projectId
    ? [
        {
          id: projectId,
          name: (meta['project_name'] as string) ?? 'Their engagement',
          state: 'active',
        },
      ]
    : [];

  const isGc = role === 'gc';

  return (
    <>
      <BackLink onBack={onBack} />
      <ProfileHead
        name={name}
        role={role}
        email={email}
        phone={phone}
        actions={
          <>
            <ActionButton
              actionKey="open-person-orders"
              label="Open in Orders"
              tone="dark"
              onClick={() =>
                notify(
                  `Cross-links to the Orders book — ${name}'s terms, orders, and lead times live there.`,
                )
              }
            />
            {isGc && projectId && (
              <ActionButton
                actionKey="open-coordination"
                label="Coordination"
                onClick={() => router.push(`/doc/${projectId}`)}
              />
            )}
          </>
        }
      />

      <div className="mt-[1.3rem] grid grid-cols-1 gap-7 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <RelationshipJourney
            events={journey}
            onFollow={(href) => router.push(href)}
            emptyLine={
              isGc
                ? 'On an active project together — the shared history fills in as work moves.'
                : 'A maker in your network — orders and lead times live in the Orders book.'
            }
          />
        </div>
        <div>
          <ProjectsCard
            title="Engagements"
            projects={projectRows}
            onOpenProject={(id) => router.push(`/doc/${id}`)}
            emptyLine={
              isGc
                ? 'No active project on file.'
                : 'Their orders live in the Orders book — open it to see the full ledger.'
            }
          />
          <TrustCard title="Track record" items={track} />
        </div>
      </div>
    </>
  );
}

/** Track-record lines for a maker / GC, from the directory meta. */
function buildNetworkTrack(
  role: PartyRole,
  meta: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  if (role === 'maker') {
    if (meta['founding_circle']) out.push('Founding Circle maker');
    const cat = (meta['primary_category'] as string) ?? '';
    if (cat) out.push(`Primary category — ${cat.replace(/_/g, ' ')}`);
    const lead = meta['lead_times'] as Record<string, unknown> | null;
    if (lead && typeof lead['standard'] === 'number')
      out.push(`${lead['standard']}-day standard lead`);
    if (meta['trade_terms']) out.push('Honors trade pricing');
    const reviews = meta['review_count'];
    const rating = meta['designer_rating_avg'];
    if (
      typeof reviews === 'number' &&
      reviews > 0 &&
      typeof rating === 'number'
    )
      out.push(
        `${rating.toFixed(1)}★ across ${reviews} ${reviews === 1 ? 'review' : 'reviews'}`,
      );
    if (meta['made_in']) out.push(`Made in ${meta['made_in']}`);
  } else if (role === 'gc') {
    const company = (meta['company_name'] as string) ?? '';
    if (company) out.push(company);
    out.push('Tracked party on the project — appears in the ball-in-court.');
  }
  if (out.length === 0) out.push('Building a track record together.');
  return out;
}

// ─── TEAM profile (the colophon) ────────────────────────────────────────────

function TeamProfile({
  role,
  name,
  email,
  phone,
  projectId,
  statusRaw,
  meta,
  onBack,
  notify,
}: {
  role: PartyRole;
  name: string;
  email: string | null;
  phone: string | null;
  projectId: string | null;
  statusRaw: string | null;
  meta: Record<string, unknown>;
  onBack: () => void;
  notify: (m: string) => void;
}) {
  const router = useRouter();
  const studioRole = humanizeTeamRole(
    statusRaw ?? (meta['role'] as string) ?? null,
  );
  const projectName = (meta['project_name'] as string) ?? null;

  return (
    <>
      <BackLink onBack={onBack} />
      <ProfileHead
        name={name}
        role={role}
        email={email}
        phone={phone}
        actions={
          <ActionButton
            actionKey="adjust-person-visibility"
            label="Adjust visibility"
            onClick={() =>
              notify(
                `Opens this teammate's document access — margin visibility is set per document in studio settings.`,
              )
            }
          />
        }
      />

      <div className="mt-[1.3rem] grid grid-cols-1 gap-7 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-[0.7rem] font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            The colophon · margin visibility
          </div>
          <p className="text-[0.78rem] leading-relaxed text-[var(--color-charcoal)]">
            {name.split(' ')[0]} is on your studio as{' '}
            <b className="font-semibold">{studioRole}</b>. Studio teammates read
            the document with margin visibility — they see the spine, the
            margin, and the work, but cost and margin stay yours unless you
            grant it.
          </p>
          <p className="mt-3 text-[0.72rem] italic leading-relaxed text-[var(--color-aged-oak)]">
            Margin visibility is granted per document, in studio settings —
            never global.
          </p>
        </div>
        <div>
          {projectId && projectName ? (
            <ProjectsCard
              title="On these documents"
              projects={[{ id: projectId, name: projectName, state: 'active' }]}
              onOpenProject={(id) => router.push(`/doc/${id}`)}
              emptyLine="Not assigned to a document yet."
            />
          ) : (
            <ProjectsCard
              title="On these documents"
              projects={[]}
              onOpenProject={(id) => router.push(`/doc/${id}`)}
              emptyLine="Not assigned to a document yet."
            />
          )}
          <TrustCard
            title="Studio role"
            items={[
              `${studioRole}`,
              'Reads the document with margin visibility',
            ]}
          />
        </div>
      </div>
    </>
  );
}

function humanizeTeamRole(raw: string | null): string {
  switch (raw) {
    case 'lead_designer':
      return 'lead designer';
    case 'support_designer':
      return 'support designer';
    case 'bookkeeper':
      return 'bookkeeper';
    case 'previous_lead':
      return 'previous lead';
    default:
      return raw?.replace(/_/g, ' ') ?? 'studio teammate';
  }
}

// ─── the role switch ────────────────────────────────────────────────────────

export function PersonProfile({
  personId,
  role,
  onBack,
  openThread,
  notify,
}: PersonProfileProps) {
  const { data: person, isLoading } = usePerson(personId, role);

  // Makers read from the vendor book itself (R78/PRC-02) — richer than the
  // directory row, and it must open PRE-admission too (the marketplace lens
  // walks into makers who aren't on the roster, so have no directory row).
  if (role === 'maker') {
    return <MakerProfile vendorId={personId} onBack={onBack} notify={notify} />;
  }

  if (isLoading || !person) {
    return (
      <>
        <BackLink onBack={onBack} />
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          {isLoading
            ? 'Reading the relationship…'
            : `We couldn't find this ${roleLabel(role).toLowerCase()}.`}
        </p>
      </>
    );
  }

  const common = {
    personId: person.person_id,
    role: person.role,
    name: person.display_name,
    email: person.email,
    phone: person.phone,
    statusRaw: person.status_raw,
    lastTouchAt: person.last_touch_at,
    meta: person.meta ?? {},
    onBack,
    notify,
  };

  if (person.role === 'client' || person.role === 'lead') {
    return (
      <ClientProfile
        {...common}
        profileId={person.profile_id}
        openThread={openThread}
      />
    );
  }

  if (person.role === 'gc') {
    return <NetworkProfile {...common} projectId={person.project_id} />;
  }

  return <TeamProfile {...common} projectId={person.project_id} />;
}
