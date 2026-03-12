'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Divider,
} from '@patina/design-system';
import { notificationDefaults, type NotificationPreferences } from '@/data/mock-admin';
import { toast } from 'sonner';
import { ShieldCheck, Settings as SettingsIcon, Globe } from 'lucide-react';

interface PlatformSettings {
  maintenanceMode: boolean;
  registrationOpen: boolean;
  requireDesignerVerification: boolean;
  maxUploadSizeMb: number;
  platformName: string;
  supportEmail: string;
  defaultCurrency: string;
}

const initialPlatformSettings: PlatformSettings = {
  maintenanceMode: false,
  registrationOpen: true,
  requireDesignerVerification: true,
  maxUploadSizeMb: 25,
  platformName: 'Patina',
  supportEmail: 'support@patina.com',
  defaultCurrency: 'USD',
};

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(notificationDefaults);
  const [platform, setPlatform] = useState<PlatformSettings>(initialPlatformSettings);

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

  const handlePlatformSave = () => {
    toast.success('Platform settings saved');
  };

  const togglePlatformSetting = (key: keyof PlatformSettings) => {
    setPlatform((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
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
            Manage platform configuration, security, and notification channels
          </p>
        </div>
      </div>

      {/* Platform Settings */}
      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Platform Settings
            </CardTitle>
            <CardDescription>Core platform configuration and operational controls</CardDescription>
          </div>
          <Button size="sm" onClick={handlePlatformSave}>
            Save Changes
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform Name</label>
              <Input
                value={platform.platformName}
                onChange={(e) => setPlatform({ ...platform, platformName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Support Email</label>
              <Input
                value={platform.supportEmail}
                onChange={(e) => setPlatform({ ...platform, supportEmail: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Currency</label>
              <Select
                value={platform.defaultCurrency}
                onValueChange={(value) => setPlatform({ ...platform, defaultCurrency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="CAD">CAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Upload Size (MB)</label>
              <Input
                type="number"
                value={platform.maxUploadSizeMb}
                onChange={(e) => setPlatform({ ...platform, maxUploadSizeMb: parseInt(e.target.value, 10) || 25 })}
              />
            </div>
          </div>
          <Divider />
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Maintenance Mode</p>
                <p className="text-sm text-muted-foreground">
                  When enabled, only admins can access the platform
                </p>
              </div>
              <Switch
                checked={platform.maintenanceMode}
                onCheckedChange={() => togglePlatformSetting('maintenanceMode')}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Open Registration</p>
                <p className="text-sm text-muted-foreground">
                  Allow new designers to register on the platform
                </p>
              </div>
              <Switch
                checked={platform.registrationOpen}
                onCheckedChange={() => togglePlatformSetting('registrationOpen')}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Require Designer Verification</p>
                <p className="text-sm text-muted-foreground">
                  New designers must be verified before accessing the catalog
                </p>
              </div>
              <Switch
                checked={platform.requireDesignerVerification}
                onCheckedChange={() => togglePlatformSetting('requireDesignerVerification')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
              <Badge variant="outline">Enforced</Badge>
            </div>
            <Divider />
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
            <Divider />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Audit log visibility</p>
                <p className="text-sm text-muted-foreground">
                  Critical actions mirrored to Slack #ops-audit
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-green-600" />
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
            <Divider />
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
