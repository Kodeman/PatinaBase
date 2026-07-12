'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ActionButton } from '@/components/portal/action-button';
import { useToast } from '@/components/portal/toast-provider';
import { useMorningBrief, useRegenerateBrief } from '@/hooks/use-morning-brief';

// WP-1.3 · Morning Brief — collapsible disclosure atop Mission Control.
// Not a card (no shadows on content, ledger rules only, per the design
// system guardrail) — a hairline-bordered section that opens/closes like the
// rest of the portal's disclosures. Collapsed state persists across reloads
// via localStorage; renders nothing when no brief has ever been generated
// (a fresh stack, or the cron hasn't fired yet and nobody has hit Regenerate).

const COLLAPSE_STORAGE_KEY = 'mc-brief-collapsed';

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.round(secs / 60)}m`;
}

export function MorningBriefPanel() {
  const { data: brief, isLoading } = useMorningBrief();
  const regenerate = useRegenerateBrief();
  const { toast } = useToast();

  // Default to expanded on both server and first client render (avoids a
  // hydration mismatch); a previously-collapsed preference is applied right
  // after mount, once localStorage is safe to read.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true') {
        setCollapsed(true);
      }
    } catch {
      // localStorage unavailable (privacy mode, etc.) — stay expanded.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // best-effort persistence only
      }
      return next;
    });
  };

  const handleRegenerate = async () => {
    try {
      await regenerate.mutateAsync();
      toast('Morning brief regenerated', 'success');
    } catch (e) {
      toast((e as Error).message || 'Failed to regenerate brief', 'error');
    }
  };

  if (isLoading || !brief) return null;

  const { content } = brief;
  const hasExceptions =
    content.exceptions.stale.length > 0 ||
    content.exceptions.failed.length > 0 ||
    content.exceptions.intake_errors.length > 0;

  return (
    <section className="border-b border-[var(--border-default)] pb-4" data-testid="morning-brief-panel">
      <div className="flex items-center justify-between gap-2 py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          data-testid="morning-brief-toggle"
          className="flex flex-1 items-center gap-2 bg-transparent text-left"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
          )}
          <span className="type-label">Morning Brief — {brief.brief_date}</span>
        </button>
        <ActionButton
          variant="muted"
          onClick={handleRegenerate}
          disabled={regenerate.isPending}
          data-testid="morning-brief-regenerate"
        >
          {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
        </ActionButton>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-5 py-1 pl-6" data-testid="morning-brief-body">
          {/* Queue */}
          <div>
            <div className="type-meta-small mb-1.5">Queue</div>
            {content.queue.length === 0 ? (
              <span className="type-label-secondary">No queue activity.</span>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {content.queue.map((q) => (
                  <span key={q.status} className="type-label-secondary">
                    {q.status}:{' '}
                    <span className="tabular-nums text-[var(--text-primary)]">{q.task_count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Vitals deltas — omitted entirely when the section is absent */}
          {content.vitals && (
            <div>
              <div className="type-meta-small mb-1.5">Vitals</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(content.vitals.current).map(([key, value]) => {
                  const delta = content.vitals?.deltas?.[key];
                  return (
                    <span key={key} className="type-label-secondary">
                      {key}:{' '}
                      <span className="tabular-nums text-[var(--text-primary)]">{String(value)}</span>
                      {delta != null && (
                        <span
                          className={`tabular-nums ${delta >= 0 ? 'text-[var(--color-sage)]' : 'text-[var(--color-terracotta)]'}`}
                        >
                          {' '}
                          {delta >= 0 ? '+' : ''}
                          {Math.round(delta * 100) / 100}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today's three */}
          <div>
            <div className="type-meta-small mb-1.5">Today&rsquo;s three</div>
            {content.todays_three.length === 0 ? (
              <span className="type-label-secondary">Nothing awaiting review.</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {content.todays_three.map((item) => (
                  <li key={item.id} className="type-label-secondary">
                    <Link
                      href="/mission-control"
                      className="text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-2 hover:text-[var(--accent-primary)]"
                    >
                      {item.summary || 'Untitled task'}
                    </Link>{' '}
                    <span className="text-[var(--text-subtle)]">
                      · P{item.priority}
                      {item.assignee ? ` · ${item.assignee}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Exceptions — grouped, terracotta accents */}
          <div>
            <div className="type-meta-small mb-1.5">Exceptions</div>
            {!hasExceptions ? (
              <span className="type-label-secondary">No exceptions.</span>
            ) : (
              <div className="flex flex-col gap-3">
                {content.exceptions.stale.length > 0 && (
                  <div>
                    <div className="type-meta-small mb-1 text-[var(--color-terracotta)]">Stale</div>
                    <ul className="flex flex-col gap-0.5">
                      {content.exceptions.stale.map((e) => (
                        <li
                          key={e.id}
                          className="type-label-secondary border-l-2 border-[var(--color-terracotta)] pl-2"
                        >
                          {e.summary} <span className="text-[var(--text-subtle)]">({e.age_hours}h)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {content.exceptions.failed.length > 0 && (
                  <div>
                    <div className="type-meta-small mb-1 text-[var(--color-terracotta)]">Failed</div>
                    <ul className="flex flex-col gap-0.5">
                      {content.exceptions.failed.map((e) => (
                        <li
                          key={e.id}
                          className="type-label-secondary border-l-2 border-[var(--color-terracotta)] pl-2"
                        >
                          {e.summary}
                          {e.last_error && (
                            <span className="text-[var(--text-subtle)]"> — {e.last_error}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {content.exceptions.intake_errors.length > 0 && (
                  <div>
                    <div className="type-meta-small mb-1 text-[var(--color-terracotta)]">
                      Intake errors
                    </div>
                    <ul className="flex flex-col gap-0.5">
                      {content.exceptions.intake_errors.map((e) => (
                        <li
                          key={e.id}
                          className="type-label-secondary border-l-2 border-[var(--color-terracotta)] pl-2"
                        >
                          {e.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Yesterday's runs — compact, one line each */}
          <div>
            <div className="type-meta-small mb-1.5">Yesterday&rsquo;s runs</div>
            {content.runs_yesterday.length === 0 ? (
              <span className="type-label-secondary">No runs yesterday.</span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {content.runs_yesterday.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="type-label-secondary">
                    {r.name}: {r.status} ({formatDuration(r.duration_ms)})
                    {r.error && <span className="text-[var(--color-terracotta)]"> — {r.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {brief.email_sent_at && (
            <div className="type-meta-small text-[var(--text-subtle)]">
              Emailed {new Date(brief.email_sent_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
