'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Flag } from 'lucide-react';

const flags = [
  { key: 'adminVerification', value: true, env: 'prod', description: 'Enable designer verification queue' },
  { key: 'adminCatalog', value: true, env: 'prod', description: 'Enable catalog management' },
  { key: 'adminSearch', value: true, env: 'prod', description: 'Enable search tuning' },
  { key: 'checkoutEnabled', value: false, env: 'stg', description: 'Enable checkout flow' },
];

export default function FlagsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Feature Flags</h1>
          <p className="text-muted-foreground">
            Manage feature flags and experiments
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Flag
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Feature Flags</CardTitle>
          <CardDescription>Control feature rollout and experiments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {flags.map((flag) => (
              <div
                key={flag.key}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Flag className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium font-mono text-sm">{flag.key}</div>
                    <div className="text-sm text-muted-foreground">{flag.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{flag.env}</Badge>
                  <Badge variant={flag.value ? 'success' : 'secondary'}>
                    {flag.value ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    Edit
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
