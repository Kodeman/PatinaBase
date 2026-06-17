'use client';

/**
 * Outreach · Campaigns (Track D) — the marketing-send list.
 *
 * Stats from `useCommsDashboard` (the Communications Dashboard, P1), the list
 * from `useCampaigns`, compose via `useCreateCampaign`, send via
 * `useSendCampaign`, and delete a draft via `useDeleteCampaign`. The composer is
 * a quiet inline "+ New campaign" form (not a modal — D1 strict focus), seeding
 * a draft from a template + a directory audience. Zero shadows (D4).
 */

import { useState } from 'react';
import {
  useCampaigns,
  useCreateCampaign,
  useSendCampaign,
  useDeleteCampaign,
  useCommsDashboard,
  useTemplates,
  useAudienceSegments,
} from '@patina/supabase';
import type { Campaign } from '@patina/shared/types';
import { StatGrid, CampRow, CampBadge, OutreachButton, ListHeader, QuietNote } from './outreach-bits';

function campaignStat(c: Campaign): string {
  if (c.status === 'sent') {
    const recipients = c.total_recipients || c.sent_count || 0;
    const opened = c.open_count || c.campaign_analytics?.opened || 0;
    const rate = recipients > 0 ? Math.round((opened / recipients) * 100) : 0;
    const when = c.sent_at ? new Date(c.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
    return [when ? `Sent · ${when}` : 'Sent', `${recipients} recipients`, `${rate}% opened`].join(' · ');
  }
  if (c.status === 'scheduled' && c.scheduled_for) {
    const when = new Date(c.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Scheduled · ${when} · ${c.total_recipients || 0} recipients`;
  }
  if (c.status === 'sending') return `Sending · ${c.sent_count || 0} of ${c.total_recipients || 0}`;
  return 'Draft';
}

export function CampaignsTab({ notify }: { notify: (m: string) => void }) {
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: dash } = useCommsDashboard('30d');
  const { data: templates } = useTemplates();
  const { data: segments } = useAudienceSegments();

  const createCampaign = useCreateCampaign();
  const sendCampaign = useSendCampaign();
  const deleteCampaign = useDeleteCampaign();

  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [segmentId, setSegmentId] = useState('');

  const stats = [
    { n: dash ? dash.stats.totalSent.toLocaleString('en-US') : '—', label: 'sent · 30 days' },
    { n: dash ? `${dash.stats.openRate}%` : '—', label: 'avg. open rate' },
    {
      n: campaigns ? campaigns.filter((c) => c.status === 'sent').length : '—',
      label: 'sends on record',
    },
  ];

  const canSubmit = name.trim() && subject.trim() && templateId && !createCampaign.isPending;

  const submit = () => {
    if (!canSubmit) return;
    createCampaign.mutate(
      {
        name: name.trim(),
        subject: subject.trim(),
        template_id: templateId,
        audience_type: segmentId ? 'segment' : 'all',
        ...(segmentId ? { audience_segment: { segment_id: segmentId } } : {}),
      },
      {
        onSuccess: () => {
          notify('Campaign drafted. Review it, then send when you’re ready.');
          setComposing(false);
          setName('');
          setSubject('');
          setTemplateId('');
          setSegmentId('');
        },
        onError: (e) => notify(e instanceof Error ? e.message : 'Could not draft the campaign.'),
      },
    );
  };

  return (
    <div>
      <StatGrid stats={stats} />

      <ListHeader
        label="Campaigns"
        action={
          <OutreachButton tone="primary" onClick={() => setComposing((v) => !v)}>
            {composing ? 'Close' : '+ New campaign'}
          </OutreachButton>
        }
      />

      {composing && (
        <div className="mb-4 rounded-[10px] border border-[var(--color-pearl)] bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Campaign name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring portfolio reveal"
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              />
            </Field>
            <Field label="Subject line">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="A look at our latest rooms"
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              />
            </Field>
            <Field label="Template">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              >
                <option value="">Choose a template…</option>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Audience (from the directory)">
              <select
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              >
                <option value="">Everyone on your list</option>
                {(segments ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <OutreachButton tone="primary" onClick={submit} disabled={!canSubmit}>
              {createCampaign.isPending ? 'Drafting…' : 'Draft campaign'}
            </OutreachButton>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="px-1 py-5 text-[0.74rem] text-[var(--color-aged-oak)]">Reading your sends…</p>
      ) : !campaigns || campaigns.length === 0 ? (
        <QuietNote>
          No campaigns yet. Compose one above — it drafts from a template and a directory audience,
          then waits for your hand to send.
        </QuietNote>
      ) : (
        campaigns.map((c) => (
          <CampRow
            key={c.id}
            name={c.name}
            stat={campaignStat(c)}
            right={
              <div className="flex items-center gap-2">
                <CampBadge status={c.status} />
                {c.status === 'draft' && (
                  <>
                    <OutreachButton
                      onClick={() =>
                        sendCampaign.mutate(c.id, {
                          onSuccess: () => notify(`“${c.name}” is on its way.`),
                          onError: (e) =>
                            notify(e instanceof Error ? e.message : 'Could not send the campaign.'),
                        })
                      }
                      disabled={sendCampaign.isPending}
                    >
                      Send
                    </OutreachButton>
                    <OutreachButton
                      tone="quiet"
                      onClick={() =>
                        deleteCampaign.mutate(c.id, {
                          onSuccess: () => notify('Draft discarded.'),
                          onError: (e) =>
                            notify(e instanceof Error ? e.message : 'Could not discard the draft.'),
                        })
                      }
                      disabled={deleteCampaign.isPending}
                    >
                      Discard
                    </OutreachButton>
                  </>
                )}
              </div>
            }
          />
        ))
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[0.44rem] font-semibold uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
        {label}
      </span>
      {children}
    </label>
  );
}
