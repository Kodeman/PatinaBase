'use client';

/**
 * In the field (Field Coordination Wave 5) — the Desk's cross-project field
 * rollup. Two populations, both actionable, never KPI tiles (Desk philosophy):
 *
 *   · triage cards — every needs_review inbound text, each with its proposed
 *     effect and Apply / Dismiss (the act lives on the card).
 *   · need-lines — the softer field nudges over field_activity_summary: parties
 *     who haven't opted in, field tasks gone overdue. Each links into the
 *     project document where the act lives.
 *
 * Its own populations over the SMS/field read models — the engagement folders
 * are never touched. Renders nothing when there's no field work, so a Desk with
 * no field crew stays clean. Zero shadows (D4).
 */

import Link from 'next/link';
import { useFieldActivity, useSmsReviewQueue } from '@patina/supabase';
import { SectionEyebrow } from '@/components/document/section-eyebrow';
import { SmsReviewCard } from './sms-review-card';

interface FieldNeedLine {
  key: string;
  projectId: string;
  projectName: string;
  text: string;
}

export function FieldDesk() {
  const { data: reviews } = useSmsReviewQueue();
  const { data: activity } = useFieldActivity();

  const cards = reviews ?? [];

  // Need-lines from the per-project rollup. The unreviewed-SMS count is already
  // carried by the triage cards, so the lines cover the softer nudges only.
  const lines: FieldNeedLine[] = [];
  for (const a of activity ?? []) {
    const name = a.project_name ?? 'a project';
    if (a.awaiting_reply_count > 0) {
      lines.push({
        key: `optin:${a.project_id}`,
        projectId: a.project_id,
        projectName: name,
        text:
          a.awaiting_reply_count === 1
            ? '1 party hasn’t opted in'
            : `${a.awaiting_reply_count} parties haven’t opted in`,
      });
    }
    if (a.overdue_field_task_count > 0) {
      lines.push({
        key: `overdue:${a.project_id}`,
        projectId: a.project_id,
        projectName: name,
        text:
          a.overdue_field_task_count === 1
            ? '1 field task overdue'
            : `${a.overdue_field_task_count} field tasks overdue`,
      });
    }
  }

  if (cards.length === 0 && lines.length === 0) return null;

  return (
    <section aria-labelledby="in-the-field" className="mt-14">
      <SectionEyebrow count={cards.length + lines.length}>
        <span id="in-the-field">In the field</span>
      </SectionEyebrow>

      {cards.length > 0 && (
        <div className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2">
          {cards.map((m) => (
            <SmsReviewCard key={m.id} message={m} />
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <ul className={`space-y-2 ${cards.length > 0 ? 'mt-10' : ''}`}>
          {lines.map((l) => (
            <li key={l.key}>
              <Link
                href={`/doc/${l.projectId}`}
                className="group flex items-baseline gap-2 text-[13px] leading-snug text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]"
              >
                <span>{l.text}</span>
                <span aria-hidden className="text-[var(--text-subtle)]">
                  —
                </span>
                <span className="font-heading italic text-[var(--text-primary)]">
                  {l.projectName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
