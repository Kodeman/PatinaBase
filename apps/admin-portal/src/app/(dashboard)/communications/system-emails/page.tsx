'use client';

import { useState } from 'react';
import { MailCheck, Info, Smartphone, Monitor } from 'lucide-react';
import { systemEmailPreviews } from '@/data/system-email-previews';
import { cn } from '@/lib/utils';

const KEY_LABELS: Record<string, string> = {
  magic_link: 'Magic link / login code',
  confirmation: 'Email confirmation',
  recovery: 'Password reset',
  email_change: 'Email change',
  invite: 'Invitation',
  reauthentication: 'Verification code',
};

export default function SystemEmailsPage() {
  const [selectedKey, setSelectedKey] = useState(systemEmailPreviews[0]?.key ?? '');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const selected =
    systemEmailPreviews.find((t) => t.key === selectedKey) ?? systemEmailPreviews[0];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start gap-2">
        <MailCheck className="w-5 h-5 text-patina-mocha-brown mt-0.5" />
        <div>
          <h1 className="text-xl font-display font-semibold text-patina-charcoal">System emails</h1>
          <p className="text-sm text-patina-clay-beige">
            The auth emails Supabase sends — magic links, login codes, confirmations, password
            resets.
          </p>
        </div>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-lg border border-patina-clay-beige/30 bg-patina-off-white/50 p-3 text-sm text-patina-charcoal/80">
        <Info className="w-4 h-4 text-patina-mocha-brown mt-0.5 shrink-0" />
        <span>
          These are edited in the repo at{' '}
          <code className="font-mono text-xs">supabase/templates/</code> and deployed to production
          with <code className="font-mono text-xs">scripts/emails/deploy-auth-templates.ts</code>.
          This page is a read-only preview with sample values.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Template list */}
        <div className="space-y-1">
          {systemEmailPreviews.map((t) => {
            const active = t.key === selected?.key;
            return (
              <button
                key={t.key}
                onClick={() => setSelectedKey(t.key)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-patina-mocha-brown bg-white'
                    : 'border-patina-clay-beige/20 bg-white/60 hover:bg-white',
                )}
              >
                <div className="text-sm font-medium text-patina-charcoal">
                  {KEY_LABELS[t.key] ?? t.key}
                </div>
                <div className="mt-0.5 truncate text-xs text-patina-clay-beige">{t.subject}</div>
              </button>
            );
          })}
        </div>

        {/* Preview */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-xs text-patina-clay-beige">
              {selected?.file} · {selected?.subject}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setDevice('desktop')}
                className={cn(
                  'rounded-md p-1.5',
                  device === 'desktop'
                    ? 'bg-patina-mocha-brown/10 text-patina-mocha-brown'
                    : 'text-patina-clay-beige hover:text-patina-charcoal',
                )}
                aria-label="Desktop preview"
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={cn(
                  'rounded-md p-1.5',
                  device === 'mobile'
                    ? 'bg-patina-mocha-brown/10 text-patina-mocha-brown'
                    : 'text-patina-clay-beige hover:text-patina-charcoal',
                )}
                aria-label="Mobile preview"
              >
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex justify-center rounded-xl bg-[#F0EDE9] p-4">
            <div className={device === 'mobile' ? 'w-[375px]' : 'w-full max-w-[640px]'}>
              {selected ? (
                <iframe
                  key={selected.key}
                  srcDoc={selected.html}
                  sandbox=""
                  className="h-[720px] w-full rounded-lg border-0 bg-white shadow-sm"
                  title={`${selected.key} preview`}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
