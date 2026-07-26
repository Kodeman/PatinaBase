'use client';

/**
 * The Match Ceremony (Arrival Arc, R106 §2) — the arrival's one home.
 * Full-bleed, typography-first, zero shadows (D4): meet the client, write the
 * introduction, offer the times — one gesture, not three surfaces.
 *
 * Left column: the arrival — the ask verbatim, the scan, the facts.
 * Right column: the designer's hand — a payload-assembled context line above a
 * serif composer ("Your words, not a template" — nothing pre-written, nothing
 * auto-sent), an optional credential line + portfolio link, and 2–3 hand-picked
 * times. The threshold act is one send: intro and slots travel together, the
 * Document is created, and the designer lands in it at Discovery.
 *
 * Put-downable, not atomic (R106 §3): the draft autosaves (~800ms) to the
 * ceremony row — leaving parks it; the Document is not created until the
 * ceremony completes. The send stays asleep (disabled, never hidden) until
 * something is written AND at least two times are offered.
 *
 * Gating: `arrival-arc` flag off, or no ceremony row for this lead (not the
 * caller's), quietly redirects to /doc/{leadId}. An already-sent ceremony
 * redirects into its Document.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCeremony,
  useSaveCeremonyDraft,
  useCeremonyComplete,
  useLead,
  useLeadScans,
  useStudioIdentity,
  type CeremonySlot,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { documentEvents } from '@/lib/analytics/document-events';
import {
  assembleContextLine,
  isCeremonySendable,
  formatBudgetBand,
} from '@/lib/document/ceremony-context';
import { SectionEyebrow } from '@/components/document/section-eyebrow';
import { CeremonyArrival } from './ceremony-arrival';
import { CeremonySlots } from './ceremony-slots';
import { DocumentAction, DocumentActionGroup } from '../document-action';

const AUTOSAVE_MS = 800;

type HeldState = 'idle' | 'holding' | 'held';

export function CeremonySurface({ leadId }: { leadId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const { user } = useAuth();

  // Fail-closed flag gate — flag-off resolves to a quiet redirect below.
  const { value: arcEnabled, isLoading: flagLoading } =
    useFeatureFlag('arrival-arc');

  const { data: ceremony, isLoading: ceremonyLoading } = useCeremony(leadId);
  const { data: lead, isLoading: leadLoading } = useLead(leadId);
  const { data: scanRows } = useLeadScans(leadId);
  // Portfolio prefill — the studio resolver's website, when trivially there.
  const { data: identity } = useStudioIdentity({
    designerId: user?.id ?? null,
  });

  // ── The draft (local truth while the composer is open) ────────────────────
  const [intro, setIntro] = useState('');
  const [credential, setCredential] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [slots, setSlots] = useState<CeremonySlot[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [held, setHeld] = useState<HeldState>('idle');
  const [sendError, setSendError] = useState(false);

  const saveDraft = useSaveCeremonyDraft();
  const complete = useCeremonyComplete();

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  // Seed the draft from the held row exactly once (re-entry keeps the draft).
  useEffect(() => {
    if (seeded || !ceremony) return;
    setIntro(ceremony.intro_text ?? '');
    setCredential(ceremony.credential_line ?? '');
    setPortfolio(ceremony.portfolio_url ?? '');
    setSlots(Array.isArray(ceremony.draft_slots) ? ceremony.draft_slots : []);
    setSeeded(true);
  }, [seeded, ceremony]);

  // Prefill the portfolio from the studio resolver — only when the row never
  // held one and the field is untouched (a cleared field re-saves as '').
  const portfolioTouched = useRef(false);
  useEffect(() => {
    if (!seeded || portfolioTouched.current) return;
    if (
      ceremony?.portfolio_url == null &&
      portfolio === '' &&
      identity?.website
    ) {
      setPortfolio(identity.website);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, identity?.website]);

  // ── Autosave (~800ms debounce, direct PostgREST update on own row) ────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef({ intro, credential, portfolio, slots });
  draftRef.current = { intro, credential, portfolio, slots };

  const flushDraft = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!ceremony) return;
    const d = draftRef.current;
    saveDraft.mutate(
      {
        ceremonyId: ceremony.id,
        patch: {
          intro_text: d.intro,
          credential_line: d.credential.trim() ? d.credential : null,
          portfolio_url: d.portfolio.trim() ? d.portfolio : null,
          draft_slots: d.slots,
          timezone,
        },
      },
      { onSuccess: () => setHeld('held'), onError: () => setHeld('idle') },
    );
  };

  const scheduleSave = () => {
    setHeld('holding');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushDraft, AUTOSAVE_MS);
  };
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const edit =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      scheduleSave();
    };

  // ── Telemetry ──────────────────────────────────────────────────────────────
  const openedRef = useRef(false);
  useEffect(() => {
    if (
      openedRef.current ||
      !ceremony ||
      ceremony.state !== 'draft' ||
      scanRows === undefined
    )
      return;
    openedRef.current = true;
    documentEvents.ceremonyOpened({
      lead_id: leadId,
      has_scan: (scanRows ?? []).some((r) => r.scan),
      has_draft: Boolean(
        ceremony.intro_text?.trim() || ceremony.draft_slots?.length,
      ),
    });
  }, [ceremony, scanRows, leadId]);

  // Route-leave with a draft in hand counts as a put-down (R106 §3) — unless
  // the send or the explicit put-down already accounted for this visit.
  const leaveRef = useRef({
    completed: false,
    putDown: false,
    introLen: 0,
    slotCount: 0,
  });
  leaveRef.current.introLen = intro.trim().length;
  leaveRef.current.slotCount = slots.length;
  useEffect(
    () => () => {
      const s = leaveRef.current;
      if (
        openedRef.current &&
        !s.completed &&
        !s.putDown &&
        (s.introLen > 0 || s.slotCount > 0)
      ) {
        documentEvents.ceremonyPutDown({
          lead_id: leadId,
          via: 'route_leave',
          intro_length: s.introLen,
          slot_count: s.slotCount,
        });
      }
    },
    [leadId],
  );

  // ── Quiet redirects (flag off · not your lead · already sent) ─────────────
  const flagOff = !flagLoading && !arcEnabled;
  // Loaded and absent (RLS hides other designers' rows) = not your lead.
  const notYours = !ceremonyLoading && !ceremony;
  const alreadySent = ceremony != null && ceremony.state !== 'draft';
  useEffect(() => {
    if (flagOff || notYours) {
      router.replace(`/doc/${leadId}`);
    } else if (alreadySent) {
      router.replace(`/doc/${ceremony?.designer_client_id ?? leadId}`);
    }
  }, [
    flagOff,
    notYours,
    alreadySent,
    ceremony?.designer_client_id,
    leadId,
    router,
  ]);

  // ── The acts ───────────────────────────────────────────────────────────────
  const sendable = isCeremonySendable(intro, slots.length);

  const onPutDown = () => {
    leaveRef.current.putDown = true;
    documentEvents.ceremonyPutDown({
      lead_id: leadId,
      via: 'put_down',
      intro_length: intro.trim().length,
      slot_count: slots.length,
    });
    flushDraft(); // the mutation survives unmount — the draft is held
    router.push('/desk');
  };

  const onSend = () => {
    if (!sendable || !ceremony || complete.isPending) return;
    setSendError(false);
    if (saveTimer.current) clearTimeout(saveTimer.current); // the RPC carries the final draft
    complete.mutate(
      {
        leadId,
        intro: intro.trim(),
        slots,
        timezone,
        credentialLine: credential.trim() || null,
        portfolioUrl: portfolio.trim() || null,
      },
      {
        onSuccess: (result) => {
          leaveRef.current.completed = true;
          const openedAt = ceremony.created_at
            ? new Date(ceremony.created_at).getTime()
            : NaN;
          documentEvents.ceremonyCompleted({
            lead_id: leadId,
            ceremony_id: result.ceremony_id,
            designer_client_id: result.designer_client_id,
            slots_offered_count: slots.length,
            time_to_complete_seconds: Number.isNaN(openedAt)
              ? null
              : Math.round((Date.now() - openedAt) / 1000),
            has_credential_line: Boolean(credential.trim()),
            has_portfolio_url: Boolean(portfolio.trim()),
          });
          // One-act-many-surfaces: the Desk (chip) and the new Document derive
          // from document_state — the app owns these keys (TriageBar pattern).
          void queryClient.invalidateQueries({ queryKey: ['document-state'] });
          router.push(`/doc/${result.designer_client_id}`);
        },
        onError: () => setSendError(true),
      },
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const loading =
    !hydrated ||
    flagLoading ||
    ceremonyLoading ||
    leadLoading ||
    !seeded ||
    !lead ||
    !ceremony;

  if (loading || flagOff || notYours || alreadySent) {
    return (
      <div className="min-h-screen bg-[var(--doc-paper)]" aria-busy>
        <p className="px-10 py-12 font-heading text-[14px] italic text-[var(--text-muted)]">
          Arriving…
        </p>
      </div>
    );
  }

  const fullName = lead.homeowner?.full_name ?? lead.contact_name ?? null;
  const firstName = fullName?.trim().split(/\s+/)[0] || null;
  const who = firstName ?? 'your client';

  const scans = (scanRows ?? []).filter((r) => r.scan);
  const primaryScan = scans[0]?.scan ?? null;
  const tags =
    scans.find((r) => r.scan?.suggested_styles?.length)?.scan
      ?.suggested_styles ?? [];

  const contextLine = assembleContextLine(
    {
      firstName,
      roomType: lead.project_type ?? null,
      budgetRange: lead.budget_range,
    },
    primaryScan ? { roomType: primaryScan.room_type } : null,
    tags,
  );

  const studioName = identity?.name ?? 'Your studio';
  const band = formatBudgetBand(lead.budget_range);

  // The fine print states only what this send will actually carry.
  const finePrint = [
    `Send creates the Document — ${who} linked`,
    primaryScan ? 'the scan into Discovery' : null,
    tags.length > 0 ? 'the tags into the Brief' : null,
    band ? 'the band carried' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="min-h-screen bg-[var(--doc-paper)]">
      <div className="mx-auto max-w-[1120px] px-6 pb-24 pt-10 sm:px-9 sm:pt-14">
        {/* Claimed — the truth the client was already told (R106 §1). */}
        <p className="mb-9 inline-flex items-center gap-2.5 rounded-[3px] border border-[var(--color-pearl)] px-4 py-2.5 font-mono text-[10.5px] tracking-[0.04em] text-[var(--color-mocha)]">
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--color-sage)]"
          />
          <span>
            Claimed · {firstName ? `${firstName} sees` : 'they see'}: “
            {studioName} has taken your request in hand — introduction on its
            way.”
          </span>
        </p>

        <header className="mb-10">
          <p className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-clay)]">
            The match ceremony
          </p>
          <h1 className="font-heading text-[34px] font-medium leading-[1.12] text-[var(--text-primary)] sm:text-[44px]">
            {firstName ? `Meet ${firstName}.` : 'A new arrival.'}
          </h1>
          <p className="mt-2.5 font-heading text-[17px] italic text-[var(--color-mocha)]">
            One send: your introduction and two or three times. Then the
            Document begins.
          </p>
        </header>

        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
          {/* ── The arrival ── */}
          <CeremonyArrival lead={lead} scans={scans} tags={tags} />

          {/* ── The designer's hand ── */}
          <div>
            <p className="border-b border-[var(--color-pearl)] pb-2.5 font-mono text-[10.5px] uppercase tracking-[0.13em] text-[var(--text-muted)]">
              {contextLine}
            </p>

            <textarea
              value={intro}
              onChange={(e) => edit(setIntro)(e.target.value)}
              placeholder={`Your words, not a template. Tell ${who} what you saw in ${
                primaryScan ? 'their room' : 'their ask'
              }…`}
              aria-label="Your introduction"
              className="mt-4 min-h-[190px] w-full resize-y rounded-[2px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-5 py-4 font-heading text-[17px] leading-[1.7] text-[var(--text-primary)] placeholder:italic placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none"
            />
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <p className="font-heading text-[13px] italic text-[var(--color-mocha)]">
                Nothing sends itself. The send is yours.
              </p>
              <p
                aria-live="polite"
                className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
              >
                {held === 'held'
                  ? 'Draft held'
                  : held === 'holding'
                    ? 'Holding…'
                    : ''}
              </p>
            </div>

            {/* The signature under the introduction — optional, one line. */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  One line under your studio name — optional
                </span>
                <input
                  type="text"
                  value={credential}
                  onChange={(e) => edit(setCredential)(e.target.value)}
                  placeholder="Residential interiors · Minneapolis"
                  className="w-full rounded-[2px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-3.5 py-2.5 font-heading text-[14.5px] text-[var(--text-primary)] placeholder:italic placeholder:text-[var(--text-subtle)] focus:border-[var(--color-clay)] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Portfolio link — optional
                </span>
                <input
                  type="url"
                  value={portfolio}
                  onChange={(e) => {
                    portfolioTouched.current = true;
                    edit(setPortfolio)(e.target.value);
                  }}
                  placeholder="https://…"
                  className="w-full rounded-[2px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-3.5 py-2.5 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--color-clay)] focus:outline-none"
                />
              </label>
            </div>

            {/* The offered times. */}
            <div className="mt-10">
              <SectionEyebrow>
                Offer times · {firstName ? `${firstName} taps` : 'they tap'} one
                on their phone
              </SectionEyebrow>
              <CeremonySlots slots={slots} onChange={edit(setSlots)} />
            </div>

            {/* The threshold. */}
            <div className="mt-10 border-t border-[var(--color-pearl)] pt-6">
              <DocumentActionGroup
                surfaceKey="ceremony"
                regionKey="introduction"
              >
                <DocumentAction
                  actionKey="send-ceremony-introduction"
                  variant="primary"
                  onClick={onSend}
                  disabled={!sendable || complete.isPending}
                  loading={complete.isPending}
                  loadingLabel="Sending…"
                >
                  Send — and begin the Document
                </DocumentAction>
                <DocumentAction
                  actionKey="put-down-ceremony"
                  variant="tertiary"
                  onClick={onPutDown}
                >
                  Put down for now
                </DocumentAction>
              </DocumentActionGroup>
              {sendError && (
                <p className="mt-3 text-[12px] text-[var(--color-terracotta)]">
                  The send didn’t go through — your draft is held. Try again.
                </p>
              )}
              <p className="mt-4 max-w-[520px] font-heading text-[13.5px] italic leading-relaxed text-[var(--color-mocha)]">
                {finePrint}. The document grows from here; nothing converts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
