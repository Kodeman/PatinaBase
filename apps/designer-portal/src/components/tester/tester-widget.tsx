'use client';

/**
 * Tester Notes — a flag-gated (`tester-notes`) floating instrument that rides
 * every designer-portal route, mounted once in the root layout.
 *
 * It looks deliberately unlike Patina — system font, black, hazard yellow, a
 * bug glyph — because a tester should never have to wonder whether the thing
 * she is looking at is the product or the tool measuring it. The whole tree
 * carries `data-feedback-layer`, which the screenshotter filters out, so a
 * captured screen is the screen and never the widget.
 *
 * z-[68] deliberately: above fullscreen viewers (z-60) and toasts (z-65), below
 * the command bar (z-70).
 */

import { useCallback, useEffect, useState } from 'react';
import { Bug, X } from 'lucide-react';
import { useUnseenShipped } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { FeedbackLedger } from '@/components/document/feedback/feedback-ledger';
import { FeedbackForm } from './feedback-form';

const YELLOW = '#ffd60a';
/** Clears the Studio Drawer / MobileBar on document shells (globals.css). */
const BOTTOM = 'var(--doc-shell-floating-bottom, 1rem)';

type Tab = 'new' | 'past';

export function TesterWidget() {
  const hydrated = useHydrated();
  const { value: enabled, isLoading } = useFeatureFlag('tester-notes');
  const { user } = useAuth();
  const { data: unseen } = useUnseenShipped();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('new');

  const openOn = useCallback((next: Tab) => {
    setTab(next);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onOpen = () => openOn('new');
    window.addEventListener('document:open-feedback', onOpen);
    return () => window.removeEventListener('document:open-feedback', onOpen);
  }, [openOn]);

  // ⌘⇧F — the keyboard doorway the old feedback button owned.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openOn('new');
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openOn]);

  // The root layout also renders the signed-out pages; nothing shows there.
  if (!hydrated || isLoading || !enabled || !user) return null;

  const hasUnseen = !!unseen && unseen.length > 0;

  return (
    <div data-feedback-layer style={{ fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @media (max-width: 639px) {
          [data-tester-panel] {
            left: 0 !important;
            right: 0 !important;
            width: auto !important;
          }
        }
      `}</style>

      {!open && (
        <button
          type="button"
          onClick={() => openOn('new')}
          className="fixed left-4 z-[68]"
          style={{
            bottom: BOTTOM,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 36,
            padding: '0 12px',
            background: '#000',
            color: YELLOW,
            border: `1px solid ${YELLOW}`,
            borderRadius: 999,
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          <Bug size={14} aria-hidden />
          TESTER
          {hasUnseen && (
            <span
              aria-label="shipped notes to see"
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: YELLOW,
                display: 'inline-block',
              }}
            />
          )}
        </button>
      )}

      {open && (
        <div
          data-tester-panel
          role="dialog"
          aria-label="Tester notes"
          className="fixed left-4 z-[68]"
          style={{
            bottom: BOTTOM,
            width: 380,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            background: '#000',
            color: '#eaeaea',
            border: `1px solid ${YELLOW}`,
            fontFamily: 'inherit',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderBottom: '1px solid #333',
            }}
          >
            <Bug size={14} aria-hidden color={YELLOW} />
            <span style={{ color: YELLOW, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>
              TESTER
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close tester notes"
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: '#999',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          <div role="tablist" aria-label="Tester notes tabs" style={{ display: 'flex', borderBottom: '1px solid #333' }}>
            <TabButton label="New note" on={tab === 'new'} onClick={() => setTab('new')} />
            <TabButton label="Past notes" on={tab === 'past'} onClick={() => setTab('past')} />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {tab === 'new' ? (
              <div style={{ padding: 12 }}>
                <FeedbackForm />
              </div>
            ) : (
              // The ledger is a Patina surface; give it its own paper ground
              // rather than restyling it for the black panel.
              <div style={{ background: 'var(--color-paper, #fff)', padding: 12 }}>
                <FeedbackLedger compact onNew={() => setTab('new')} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      style={{
        flex: 1,
        minHeight: 34,
        background: 'transparent',
        border: 'none',
        borderBottom: on ? `2px solid ${YELLOW}` : '2px solid transparent',
        color: on ? YELLOW : '#999',
        fontFamily: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
