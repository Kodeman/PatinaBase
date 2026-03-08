'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { notificationDefaults, type NotificationPreferences } from '@/data/mock-admin';
import { toast } from 'sonner';
import { ShieldCheck, Settings as SettingsIcon } from 'lucide-react';

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(notificationDefaults);

  const toggleChannel = (channel: keyof NotificationPreferences['channels']) => {
    setPreferences((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: !prev.channels[channel],
      },
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
      escalation: {
        ...prev.escalation,
        [key]: !prev.escalation[key],
      },
    }));
  };

  const handleDigestChange = (value: NotificationPreferences['digests']) => {
    setPreferences((prev) => ({
      ...prev,
      digests: value,
    }));
  };

  const handleSave = () => {
    toast.success('Notification preferences updated');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <SettingsIcon className="h-3.5 w-3.5" />
          Admin Settings
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your operator profile, security, and notification channels
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your admin account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input value="admin@patina.com" readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <div className="flex flex-wrap gap-2">
              <Badge>Platform Admin</Badge>
              <Badge variant="outline">SRE Override</Badge>
            </div>
          </div>
          <Button className="w-fit">Update Profile</Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Authentication and access controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Multi-factor authentication</p>
                <p className="text-sm text-muted-foreground">
                  Required for all elevated roles
                </p>
              </div>
              <Badge variant="success">Enforced</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Session management</p>
                <p className="text-sm text-muted-foreground">
                  Monitor devices and revoke stale sessions
                </p>
              </div>
              <Button variant="outline" size="sm">
                Review Sessions
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Audit log visibility</p>
                <p className="text-sm text-muted-foreground">
                  Critical actions mirrored to Slack #ops-audit
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Channels</CardTitle>
            <CardDescription>Decide where the platform pings you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(preferences.channels).map(([channel, enabled]) => (
              <div key={channel} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium capitalize">{channel}</p>
                  <p className="text-sm text-muted-foreground">
                    {channel === 'email' && 'Incident alerts & weekly digest'}
                    {channel === 'sms' && 'Critical escalations only'}
                    {channel === 'slack' && 'Real-time room updates'}
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={() => toggleChannel(channel as keyof NotificationPreferences['channels'])} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Digests & Escalations</CardTitle>
            <CardDescription>How often summaries and crisis alerts fire</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">Digest cadence</p>
              <Select value={preferences.digests} onValueChange={(value) => handleDigestChange(value as NotificationPreferences['digests'])}>
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
            <Separator />
            {Object.entries(preferences.escalation).map(([key, enabled]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium capitalize">
                    {key === 'pagerDuty' && 'PagerDuty bridge'}
                    {key === 'smsBackup' && 'SMS backup'}
                    {key === 'emailSummary' && 'Email summary'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {key === 'pagerDuty' && 'Escalate SEV1 incidents'}
                    {key === 'smsBackup' && 'Fallback if push fails'}
                    {key === 'emailSummary' && 'Delivered when digest fails'}
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={() => toggleEscalation(key as keyof NotificationPreferences['escalation'])} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Alert Categories</CardTitle>
              <CardDescription>Turn on/off specific operational streams</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={handleSave}>
              Save Preferences
            </Button>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {preferences.categories.map((category) => (
              <div
                key={category.key}
                className="flex items-start justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{category.label}</p>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
                <Switch checked={category.enabled} onCheckedChange={() => toggleCategory(category.key)} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Changes sync to Slack + email instantly. SMS toggles require security approval.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
