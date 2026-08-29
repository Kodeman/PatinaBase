'use client';

/**
 * Account · Notifications — the four event toggles, read/written through the
 * canonical /api/user/preferences endpoint (the same one the old settings page
 * and the public preferences page use, so all surfaces stay consistent).
 * Charcoal re-skin of the toggle rows; the margin/interruption model is
 * separate (that's ⌘K → Interruptions).
 */

import { useEffect, useState } from 'react';

type Prefs = Record<string, boolean>;

const PREFERENCES: { key: string; label: string; blurb: string }[] = [
  {
    key: 'type_new_lead',
    label: 'New leads',
    blurb: 'A prospect reaches out or a lead is captured.',
  },
  {
    key: 'type_project_milestone',
    label: 'Project updates',
    blurb: 'A project crosses a milestone or changes stage.',
  },
  {
    key: 'type_client_message',
    label: 'Client messages',
    blurb: 'A client replies in a thread.',
  },
  {
    key: 'type_commission_earned',
    label: 'Earnings',
    blurb: 'A design fee or commission is recorded.',
  },
];

export function AccountNotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/user/preferences')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && !data.error) setPrefs(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const toggle = (key: string, value: boolean) => {
    // Optimistic, then PATCH the canonical endpoint.
    setPrefs((prev) => ({ ...(prev || {}), [key]: value }));
    fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) setPrefs(data);
      })
      .catch(() => {});
  };

  const settings = prefs || {};

  return (
    <div className="pt-1">
      <p className="mb-5 text-[12px] leading-relaxed text-[var(--color-aged-oak)]">
        Which Patina events reach your inbox. Mute any channel without affecting
        the others — this is email only; what breaks through the margin is set
        in ⌘K → Interruptions.
      </p>
      <div className="mb-4 flex items-start gap-3 border-y border-[var(--color-pearl)] py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-[var(--color-charcoal)]">
            Project file changes
          </span>
          <span className="block text-[11px] text-[var(--color-aged-oak)]">
            New files and revisions appear in the project margin and The Post
            with the teammate, file, project, and time.
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          In app
        </span>
      </div>
      <ul>
        {PREFERENCES.map((pref) => {
          // Default-on: a missing key reads as enabled (matches the old form).
          const enabled = settings[pref.key] !== false;
          return (
            <li
              key={pref.key}
              className="flex items-center gap-3 border-b border-[var(--color-pearl)] py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--color-charcoal)]">
                  {pref.label}
                </span>
                <span className="block text-[11px] text-[var(--color-aged-oak)]">
                  {pref.blurb}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${pref.label} email notifications`}
                onClick={() => toggle(pref.key, !enabled)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
              >
                <span
                  className={`relative h-[20px] w-[36px] rounded-full border transition-colors ${
                    enabled
                      ? 'border-[var(--color-clay)] bg-[var(--color-clay)]'
                      : 'border-[var(--color-aged-oak)] bg-transparent'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all ${
                      enabled ? 'bg-white' : 'bg-[var(--color-aged-oak)]'
                    }`}
                    style={{ left: enabled ? 18 : 2 }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
