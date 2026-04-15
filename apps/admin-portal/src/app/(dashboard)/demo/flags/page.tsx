'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Flag } from 'lucide-react';
import {
  PageHeader,
  Section,
  ListRow,
  StatusDot,
  ActionButton,
} from '@/components/portal';

const flags = [
  { key: 'adminVerification', value: true, env: 'prod', description: 'Enable designer verification queue' },
  { key: 'adminCatalog', value: true, env: 'prod', description: 'Enable catalog management' },
  { key: 'adminSearch', value: true, env: 'prod', description: 'Enable search tuning' },
  { key: 'checkoutEnabled', value: false, env: 'stg', description: 'Enable checkout flow' },
];

export default function FlagsPage() {
  return (
    <div>
      <PageHeader
        title="Feature"
        accent="Flags"
        description="Manage feature flags and experiments."
        actions={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Flag
          </Button>
        }
      />

      <Section title="Active Feature Flags" className="mt-10">
        <div>
          {flags.map((flag) => (
            <ListRow
              key={flag.key}
              leading={<Flag className="h-4 w-4 text-[var(--text-muted)]" />}
              title={<span className="font-mono text-[0.85rem]">{flag.key}</span>}
              meta={[flag.description]}
              right={
                <>
                  <Badge variant="outline">{flag.env}</Badge>
                  <StatusDot
                    variant={flag.value ? 'success' : 'neutral'}
                    label={flag.value ? 'Enabled' : 'Disabled'}
                  />
                  <ActionButton variant="muted">Edit</ActionButton>
                </>
              }
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
