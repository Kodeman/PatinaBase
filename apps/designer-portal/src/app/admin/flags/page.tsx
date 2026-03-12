'use client';

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Switch,
} from '@patina/design-system';
import { Plus, Flag, Search, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/utils';

interface FeatureFlagLocal {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  env: string;
  updatedAt: string;
  updatedBy: string;
}

const initialFlags: FeatureFlagLocal[] = [
  {
    key: 'adminVerification',
    name: 'Designer Verification Queue',
    description: 'Enable the designer verification workflow for new signups',
    enabled: true,
    env: 'prod',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    updatedBy: 'admin@patina.com',
  },
  {
    key: 'adminCatalog',
    name: 'Catalog Management',
    description: 'Enable full catalog management capabilities in admin panel',
    enabled: true,
    env: 'prod',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    updatedBy: 'admin@patina.com',
  },
  {
    key: 'adminSearch',
    name: 'Search Tuning',
    description: 'Enable search configuration and synonym management',
    enabled: true,
    env: 'prod',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    updatedBy: 'admin@patina.com',
  },
  {
    key: 'checkoutEnabled',
    name: 'Checkout Flow',
    description: 'Enable the checkout and payment processing flow',
    enabled: false,
    env: 'staging',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updatedBy: 'admin@patina.com',
  },
  {
    key: 'realtimeCollab',
    name: 'Real-time Collaboration',
    description: 'Enable WebSocket-based real-time project collaboration',
    enabled: false,
    env: 'staging',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    updatedBy: 'dev@patina.com',
  },
  {
    key: 'aiSuggestions',
    name: 'AI Product Suggestions',
    description: 'Enable ML-powered product recommendations for designers',
    enabled: false,
    env: 'dev',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    updatedBy: 'dev@patina.com',
  },
  {
    key: 'bulkImport',
    name: 'Bulk Product Import',
    description: 'Allow CSV/JSON bulk import of products into the catalog',
    enabled: true,
    env: 'prod',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    updatedBy: 'admin@patina.com',
  },
];

export default function FlagsPage() {
  const [flags, setFlags] = useState<FeatureFlagLocal[]>(initialFlags);
  const [searchQuery, setSearchQuery] = useState('');
  const [envFilter, setEnvFilter] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: '', name: '', description: '', env: 'dev' });

  const handleToggle = useCallback((key: string) => {
    setFlags((prev) =>
      prev.map((flag) =>
        flag.key === key
          ? {
              ...flag,
              enabled: !flag.enabled,
              updatedAt: new Date().toISOString(),
              updatedBy: 'admin@patina.com',
            }
          : flag
      )
    );
    const flag = flags.find((f) => f.key === key);
    if (flag) {
      toast.success(`${flag.name} ${flag.enabled ? 'disabled' : 'enabled'}`);
    }
  }, [flags]);

  const handleDelete = useCallback((key: string) => {
    const flag = flags.find((f) => f.key === key);
    setFlags((prev) => prev.filter((f) => f.key !== key));
    if (flag) {
      toast.success(`Flag "${flag.name}" deleted`);
    }
  }, [flags]);

  const handleCreate = useCallback(() => {
    if (!newFlag.key || !newFlag.name) {
      toast.error('Key and name are required');
      return;
    }
    if (flags.some((f) => f.key === newFlag.key)) {
      toast.error('A flag with this key already exists');
      return;
    }
    setFlags((prev) => [
      ...prev,
      {
        ...newFlag,
        enabled: false,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin@patina.com',
      },
    ]);
    setNewFlag({ key: '', name: '', description: '', env: 'dev' });
    setShowCreateForm(false);
    toast.success(`Flag "${newFlag.name}" created`);
  }, [newFlag, flags]);

  const filteredFlags = flags.filter((flag) => {
    const matchesSearch =
      !searchQuery ||
      flag.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEnv = !envFilter || flag.env === envFilter;
    return matchesSearch && matchesEnv;
  });

  const envCounts = flags.reduce<Record<string, number>>((acc, flag) => {
    acc[flag.env] = (acc[flag.env] || 0) + 1;
    return acc;
  }, {});

  const enabledCount = flags.filter((f) => f.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feature Flags</h1>
          <p className="text-muted-foreground">
            Manage feature flags and rollout experiments
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? (
            <>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Create Flag
            </>
          )}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{flags.length}</div>
            <p className="text-xs text-muted-foreground">Total flags</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{enabledCount}</div>
            <p className="text-xs text-muted-foreground">Enabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-400">{flags.length - enabledCount}</div>
            <p className="text-xs text-muted-foreground">Disabled</p>
          </CardContent>
        </Card>
      </div>

      {/* Create flag form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Flag</CardTitle>
            <CardDescription>Add a new feature flag to the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Key</label>
                <Input
                  placeholder="e.g. myNewFeature"
                  value={newFlag.key}
                  onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g. My New Feature"
                  value={newFlag.name}
                  onChange={(e) => setNewFlag({ ...newFlag, name: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Describe what this flag controls..."
                  value={newFlag.description}
                  onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Environment</label>
                <div className="flex gap-2">
                  {['dev', 'staging', 'prod'].map((env) => (
                    <Button
                      key={env}
                      variant={newFlag.env === env ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNewFlag({ ...newFlag, env })}
                    >
                      {env}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-end justify-end">
                <Button onClick={handleCreate}>
                  <Check className="mr-2 h-4 w-4" />
                  Create Flag
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search flags..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={envFilter === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEnvFilter(null)}
          >
            All
          </Button>
          {Object.entries(envCounts).map(([env, count]) => (
            <Button
              key={env}
              variant={envFilter === env ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEnvFilter(envFilter === env ? null : env)}
            >
              {env} ({count})
            </Button>
          ))}
        </div>
      </div>

      {/* Flags list */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>
            {filteredFlags.length} flag{filteredFlags.length !== 1 ? 's' : ''} shown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredFlags.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No flags match your search criteria
              </div>
            )}
            {filteredFlags.map((flag) => (
              <div
                key={flag.key}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Flag className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{flag.name}</span>
                      <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {flag.key}
                      </code>
                    </div>
                    <div className="text-sm text-muted-foreground truncate">{flag.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Updated {formatRelativeTime(flag.updatedAt)} by {flag.updatedBy}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <Badge variant="outline">{flag.env}</Badge>
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={() => handleToggle(flag.key)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(flag.key)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
