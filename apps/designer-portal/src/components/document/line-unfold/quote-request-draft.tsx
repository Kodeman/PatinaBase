'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useVendor } from '@patina/supabase';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import { FIELD_CLS, LABEL_CLS } from './cell';
import type { QuoteLineCandidate } from './quote-model';

type RequestContext = {
  item: Pick<QuoteLineCandidate, 'name' | 'quantity'>;
  projectName: string;
  vendor: { id: string; name: string };
};

function QuoteRequestDraft({ item, projectName, vendor, onClose }: RequestContext & { onClose: () => void }) {
  const { data: profile, isLoading, error } = useVendor(vendor.id);
  const email = profile?.orders_email?.trim() || profile?.contact_info?.email?.trim();
  const [text, setText] = useState(
    `Hello ${vendor.name},\n\nPlease send a quote for ${item.name}${item.quantity ? ` ×${item.quantity}` : ''} for ${projectName}.\n\nPlease include unit trade price, lead time, freight and crating, payment terms, and how long the quote is good for.`,
  );
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <DocSheet open onClose={onClose} title={`Draft quote request · ${vendor.name}`} icon={FileText} kind="quote-request-draft">
      <div className="space-y-4" data-testid="quote-request-draft">
        <p className="text-[12px] text-[var(--color-charcoal)]">Nothing is sent from Patina</p>
        <p className="break-words text-[12px] text-[var(--color-charcoal)]">
          {isLoading ? 'Reading vendor email…' : error ? 'Vendor email could not be read' : email || 'Vendor email not recorded'}
        </p>
        <label className="block">
          <span className={LABEL_CLS}>Quote request text</span>
          <textarea
            value={text}
            rows={8}
            onChange={(e) => { setText(e.target.value); setCopyState('idle'); }}
            className={`mt-1 block w-full rounded-[3px] border border-[var(--color-pearl)] p-2 ${FIELD_CLS}`}
          />
        </label>
        <p className="text-[11px] text-[var(--text-muted)]">Copy this text into your email to the maker. This draft is not saved.</p>
        {copyState === 'copied' && <p role="status" className="text-[12px] text-[var(--color-charcoal)]">Request text copied</p>}
        {copyState === 'failed' && <p role="alert" className="text-[12px] text-[var(--color-terracotta-ink)]">Select and copy the request text; clipboard access was not available.</p>}
        <DocumentActionGroup surfaceKey="project" regionKey="quote-request-draft">
          <DocumentAction actionKey="close-quote-request-draft" variant="tertiary" onClick={onClose}>Put back</DocumentAction>
          <DocumentAction actionKey="copy-quote-request-text" variant="secondary" disabled={!text.trim()} onClick={() => void copy()}>Copy request text</DocumentAction>
        </DocumentActionGroup>
      </div>
    </DocSheet>
  );
}

// The existing quote-request POST sends immediately; this act must never invoke it.
export function DraftQuoteRequestAct(props: RequestContext) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DocumentAction actionKey="draft-quote-request" surfaceKey="project" regionKey="ffe-quote-cell" variant="tertiary" className="mt-1" onClick={() => setOpen(true)}>
        Draft quote request
      </DocumentAction>
      {open && <QuoteRequestDraft {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
