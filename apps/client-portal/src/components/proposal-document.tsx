'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@patina/supabase';
import type { Proposal, ProposalSection, ProposalItem } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { StrataMark } from '@/components/strata-mark';

interface ProposalDocumentProps {
  proposal: Proposal & { items?: ProposalItem[]; version?: number };
  sections: ProposalSection[];
  trackEngagement?: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function ProposalDocument({ proposal, sections, trackEngagement = true }: ProposalDocumentProps) {
  const { user } = useAuth();
  const hasRecordedOpen = useRef(false);
  const activeSectionRef = useRef<string | null>(null);
  const sectionStartRef = useRef<number>(0);

  const recordEvent = useCallback(
    async (eventType: string, sectionType?: string, durationSeconds?: number) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = createBrowserClient() as any;
        await supabase.from('proposal_engagement').insert({
          proposal_id: proposal.id,
          viewer_id: user?.id ?? null,
          event_type: eventType,
          section_type: sectionType ?? null,
          duration_seconds: durationSeconds ?? null,
          metadata: {},
        });
      } catch {
        // Silent — engagement tracking should never block render
      }
    },
    [proposal.id, user?.id]
  );

  useEffect(() => {
    if (!trackEngagement || hasRecordedOpen.current) return;
    if (!user || user.id === proposal.designer_id) return;

    hasRecordedOpen.current = true;
    void recordEvent('opened');

    if (proposal.status === 'sent') {
      void (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const supabase = createBrowserClient() as any;
          await supabase
            .from('proposals')
            .update({ status: 'viewed', viewed_at: new Date().toISOString() })
            .eq('id', proposal.id);
        } catch {
          // Silent
        }
      })();
    }
  }, [trackEngagement, user, proposal.id, proposal.status, proposal.designer_id, recordEvent]);

  useEffect(() => {
    if (!trackEngagement) return;
    if (!sections || sections.length === 0) return;

    const flushActive = () => {
      if (activeSectionRef.current && sectionStartRef.current > 0) {
        const elapsed = Math.round((Date.now() - sectionStartRef.current) / 1000);
        if (elapsed >= 2) {
          void recordEvent('section_viewed', activeSectionRef.current, elapsed);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionType = (entry.target as HTMLElement).dataset.sectionType;
          if (!sectionType) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (activeSectionRef.current !== sectionType) {
              flushActive();
              activeSectionRef.current = sectionType;
              sectionStartRef.current = Date.now();
            }
          }
        }
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('[data-section-type]').forEach((el) => observer.observe(el));

    const handleUnload = () => flushActive();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      flushActive();
      observer.disconnect();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [trackEngagement, sections, recordEvent]);

  const items = proposal.items ?? [];

  return (
    <article
      className="proposal-print-area mx-auto rounded-lg bg-white shadow-sm"
      style={{
        maxWidth: 760,
        padding: 'clamp(1.5rem, 3vw, 2.5rem)',
        boxShadow: '0 1px 3px rgba(44,41,38,0.04), 0 8px 32px rgba(44,41,38,0.05)',
      }}
    >
      <header className="mb-8 flex items-baseline justify-between border-b border-[var(--border-subtle)] pb-6">
        <div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.65rem',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Proposal
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.6rem',
              fontWeight: 400,
              color: 'var(--text-primary)',
              marginTop: '0.25rem',
            }}
          >
            {proposal.title}
          </h1>
          {proposal.client?.full_name && (
            <p className="type-meta mt-1 text-[var(--text-muted)]">
              For {proposal.client.full_name}
            </p>
          )}
        </div>
        <span className="type-meta-small text-[var(--text-muted)]">
          {formatDate(proposal.created_at)}
        </span>
      </header>

      {sections.map((section, index) => (
        <div key={section.id} data-section-type={section.type}>
          {index > 0 && <StrataMark variant="micro" />}

          <section className="py-8">
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '1.4rem',
                color: 'var(--text-primary)',
                marginBottom: '1.25rem',
              }}
            >
              {section.title}
            </h2>

            {section.body && section.type !== 'investment' && section.type !== 'timeline' && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.92rem',
                  lineHeight: 1.75,
                  color: 'var(--text-body)',
                  maxWidth: 640,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {section.body}
              </p>
            )}

            {section.type === 'concept' && (
              <ConceptBlock metadata={section.metadata} />
            )}

            {section.type === 'space_plan' && (
              <SpacePlanBlock metadata={section.metadata} />
            )}

            {section.type === 'selections' && items.length > 0 && (
              <SelectionsList items={items} />
            )}

            {section.type === 'investment' && (
              <InvestmentBlock items={items} totalAmount={proposal.total_amount || 0} />
            )}

            {section.type === 'timeline' && (
              <TimelineBlock metadata={section.metadata} />
            )}
          </section>
        </div>
      ))}

      <footer className="mt-12 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-6">
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Patina
        </span>
        <span className="type-meta-small">
          {proposal.title} &middot; v{proposal.version ?? 1}.0
        </span>
      </footer>
    </article>
  );
}

function ConceptBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const moodUrls = (metadata?.mood_board_urls as string[]) || [];
  const palette = (metadata?.color_palette as Array<{ hex: string }>) || [];
  if (moodUrls.length === 0 && palette.length === 0) return null;
  return (
    <div className="mt-6">
      {moodUrls.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2.5">
          {moodUrls.map((url, i) => (
            <div key={i} className="h-[75px] w-[100px] overflow-hidden rounded bg-[var(--color-pearl)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
      {palette.length > 0 && (
        <div className="flex gap-1.5">
          {palette.map((c, i) => (
            <div key={i} className="h-12 w-12 rounded" style={{ background: c.hex }} />
          ))}
        </div>
      )}
    </div>
  );
}

function SpacePlanBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const url = metadata?.floor_plan_url as string | undefined;
  return (
    <div
      className="relative mt-4 mb-4 flex h-[220px] items-center justify-center overflow-hidden rounded-lg"
      style={{ background: 'var(--color-pearl, #f5f3ee)' }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Space plan" className="h-full w-full object-contain" />
      ) : (
        <span className="type-meta-small">Space plan pending</span>
      )}
    </div>
  );
}

function SelectionsList({ items }: { items: ProposalItem[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
        >
          {(item.image_url || item.product?.images?.[0]) && (
            <div
              className="h-12 w-12 flex-shrink-0 overflow-hidden rounded"
              style={{ background: 'var(--color-pearl, #f5f3ee)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_url || item.product?.images?.[0]!}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="type-body-small font-medium text-[var(--text-primary)]">
              {item.name || item.product?.name || 'Item'}
            </p>
            {(item.vendor_name || item.product?.brand) && (
              <p className="type-meta-small text-[var(--text-muted)]">
                {item.vendor_name || item.product?.brand}
                {item.quantity > 1 && ` · Qty ${item.quantity}`}
              </p>
            )}
          </div>
          <span className="type-meta text-[var(--text-primary)]">
            {formatCurrency(item.unit_price * item.quantity)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InvestmentBlock({ items, totalAmount }: { items: ProposalItem[]; totalAmount: number }) {
  const milestones = [
    { label: 'Deposit', percent: 30, description: 'due on signing' },
    { label: 'Procurement', percent: 40, description: 'due before ordering' },
    { label: 'Completion', percent: 30, description: 'due on final walkthrough' },
  ];
  return (
    <div className="mt-2">
      {items.length > 0 && (
        <table className="w-full border-collapse">
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--border-subtle)]">
                <td className="py-2 type-body-small text-[var(--text-body)]">
                  {item.name || item.product?.name || 'Item'}
                </td>
                <td className="py-2 text-right type-body-small text-[var(--text-primary)]">
                  {formatCurrency(item.unit_price * item.quantity)}
                </td>
              </tr>
            ))}
            <tr>
              <td
                className="pt-3 type-meta text-[var(--text-muted)]"
                style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
              >
                Total
              </td>
              <td className="pt-3 text-right" style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                {formatCurrency(totalAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-6">
        <p
          className="mb-3 type-meta-small text-[var(--text-muted)]"
          style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}
        >
          Payment schedule
        </p>
        <ul className="space-y-1.5">
          {milestones.map((m) => (
            <li key={m.label} className="flex items-baseline justify-between type-body-small">
              <span className="text-[var(--text-primary)]">
                {m.label} <span className="text-[var(--text-muted)]">— {m.description}</span>
              </span>
              <span className="text-[var(--text-primary)]">
                {formatCurrency((totalAmount * m.percent) / 100)}{' '}
                <span className="text-[var(--text-muted)]">({m.percent}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TimelineBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const phases =
    (metadata?.phases as Array<{ dateRange: string; name: string }>) || [
      { dateRange: 'Weeks 1–2', name: 'Consultation & site documentation' },
      { dateRange: 'Weeks 3–6', name: 'Concept development & design presentation' },
      { dateRange: 'Weeks 7–10', name: 'Refinement, final selections, client approvals' },
      { dateRange: 'Weeks 11–16', name: 'Procurement & order management' },
      { dateRange: 'Weeks 17–18', name: 'Delivery, installation & styling' },
      { dateRange: 'Week 19', name: 'Final walkthrough & photography' },
    ];
  return (
    <ul className="mt-2 space-y-2.5">
      {phases.map((p, i) => (
        <li key={i} className="flex items-baseline gap-4">
          <span
            className="type-meta-small flex-shrink-0 text-[var(--text-muted)]"
            style={{ minWidth: 110, letterSpacing: '0.06em' }}
          >
            {p.dateRange}
          </span>
          <span className="type-body-small text-[var(--text-body)]">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}
