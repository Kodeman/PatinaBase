'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { notificationDefaults, type NotificationPreferences } from '@/data/mock-admin';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import {
  PageHeader,
  Section,
  StatusDot,
} from '@/components/portal';

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(notificationDefaults);

  const toggleChannel = (channel: keyof NotificationPreferences['channels']) => {
    setPreferences((prev) => ({
      ...prev,
      channels: { ...prev.channels, [channel]: !prev.channels[channel] },
    }));
  };

  const toggleCategory = (key: string) => {
    setPreferences((prev) => ({
      ...prev,
      categories: prev.categories.map((category) =>
        category.key === key ? { ...category, enabled: !category.enabled } : category
      ),
    }));
  };

  const toggleEscalation = (key: keyof NotificationPreferences['escalation']) => {
    setPreferences((prev) => ({
      ...prev,
      escalation: { ...prev.escalation, [key]: !prev.escalation[key] },
    }));
  };

  const handleDigestChange = (value: NotificationPreferences['digests']) => {
    setPreferences((prev) => ({ ...prev, digests: value }));
  };

  const handleSave = () => {
    toast.success('Notification preferences updated');
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your operator profile, security, and notification channels."
      />

      <Section title="Profile" className="mt-10">
        <div className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <label className="type-meta-small">Email</label>
            <Input value="admin@patina.com" readOnly />
          </div>
          <div className="space-y-2">
            <label className="type-meta-small">Role</label>
            <div className="flex flex-wrap gap-2">
              <Badge>Platform Admin</Badge>
              <Badge variant="outline">SRE Override</Badge>
            </div>
          </div>
          <Button className="w-fit">Update Profile</Button>
        </div>
      </Section>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <Section title="Security">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4">
              <div>
                <p className="type-label">Multi-factor authentication</p>
                <p className="type-body-small text-[var(--text-muted)]">
                  Required for all elevated roles
                </p>
              </div>
              <StatusDot variant="success" label="Enforced" />
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4">
              <div>
                <p className="type-label">Session management</p>
                <p className="type-body-small text-[var(--text-muted)]">
                  Monitor devices and revoke stale sessions
                </p>
              </div>
              <Button variant="outline" size="sm">
                Review Sessions
              </Button>
            </div>
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="type-label">Audit log visibility</p>
                <p className="type-body-small text-[var(--text-muted)]">
                  Critical actions mirrored to Slack #ops-audit
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[var(--color-success)]" />
            </div>
          </div>
        </Section>

        <Section title="Notification Channels">
          <div>
            {Object.entries(preferences.channels).map(([channel, enabled]) => (
              <div
                key={channel}
                className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4 last:border-b-0"
              >
                <div>
                  <p className="type-label capitalize">{channel}</p>
                  <p className="type-body-small text-[var(--text-muted)]">
                    {channel === 'email' && 'Incident alerts & weekly digest'}
                    {channel === 'sms' && 'Critical escalations only'}
                    {channel === 'slack' && 'Real-time room updates'}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() =>
                    toggleChannel(channel as keyof NotificationPreferences['channels'])
                  }
                />
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Section title="Digests & Escalations">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="type-meta-small">Digest cadence</p>
              <Select
                value={preferences.digests}
                onValueChange={(value) =>
                  handleDigestChange(value as NotificationPreferences['digests'])
                }
              >
                <SelectTrigger className="w-full md:w-60">
                  <SelectValue placeholder="Select cadence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily at 7:00 AM</SelectItem>
                  <SelectItem value="weekly">Weekly (Mondays)</SelectItem>
                  <SelectItem value="monthly">Monthly summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {Object.entries(preferences.escalation).map(([key, enabled]) => (
              <div
                key={key}
                className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4 last:border-b-0"
              >
                <div>
                  <p className="type-label capitalize">
                    {key === 'pagerDuty' && 'PagerDuty bridge'}
                    {key === 'smsBackup' && 'SMS backup'}
                    {key === 'emailSummary' && 'Email summary'}
                  </p>
                  <p className="type-body-small text-[var(--text-muted)]">
                    {key === 'pagerDuty' && 'Escalate SEV1 incidents'}
                    {key === 'smsBackup' && 'Fallback if push fails'}
                    {key === 'emailSummary' && 'Delivered when digest fails'}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() =>
                    toggleEscalation(key as keyof NotificationPreferences['escalation'])
                  }
                />
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Alert Categories"
          action={
            <Button size="sm" variant="outline" onClick={handleSave}>
              Save Preferences
            </Button>
          }
        >
          <div>
            {preferences.categories.map((category) => (
              <div
                key={category.key}
                className="flex items-start justify-between border-b border-[var(--border-subtle)] py-4 last:border-b-0"
              >
                <div>
                  <p className="type-label">{category.label}</p>
                  <p className="type-body-small text-[var(--text-muted)]">
                    {category.description}
                  </p>
                </div>
                <Switch
                  checked={category.enabled}
                  onCheckedChange={() => toggleCategory(category.key)}
                />
              </div>
            ))}
            <p className="type-meta-small mt-4">
              Changes sync to Slack + email instantly. SMS toggles require security approval.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
