'use client';

import { useState } from 'react';
import { useApplyVendorQuoteToLines, useVendorQuotes } from '@patina/supabase';
import { fmtUsd } from '@/lib/document/format';
import { DocumentAction } from '../document-action';
import { CellSub, CellValue, UnfoldCell } from './cell';
import {
  applyQuoteArgs,
  applyRefusal,
  latestQuoteForLine,
  openChangeOrder,
  quoteSentence,
  type ApplyRefusal,
  type LineQuote,
} from './quote-model';
import { RecordQuoteAct } from './record-quote';

type FFERow = any;

/**
 * "Use this price" writes the quoted unit as the line's trade cost — trade
 * only; the client price stays as it is (R1/R2). A line on a sent, signed or
 * executed authorization is refused with change_order_required, and that
 * refusal is routed, never retried (R8).
 */
function UseQuotedPrice({
  quote,
  itemId,
  projectId,
}: {
  quote: LineQuote;
  itemId: string;
  projectId: string;
}) {
  const apply = useApplyVendorQuoteToLines({ errorSurface: 'inline' });
  const [refusal, setRefusal] = useState<ApplyRefusal | null>(null);

  const use = async () => {
    if (apply.isPending) return;
    setRefusal(null);
    try {
      await apply.mutateAsync(applyQuoteArgs(quote, itemId, projectId));
    } catch (e) {
      setRefusal(applyRefusal(e));
    }
  };

  return (
    <>
      <DocumentAction
        actionKey="apply-vendor-quote"
        surfaceKey="project"
        regionKey="ffe-quote-cell"
        variant="secondary"
        className="mt-1"
        loading={apply.isPending}
        loadingLabel="Using…"
        onClick={() => void use()}
      >
        Use this price
      </DocumentAction>
      {refusal && (
        <p role="alert" className="mt-1 text-[11px] text-[var(--color-terracotta-ink)]">
          {refusal.sentence}
        </p>
      )}
      {refusal?.route === 'change_order' && (
        <DocumentAction
          actionKey="open-change-order-from-quote"
          surfaceKey="project"
          regionKey="ffe-quote-cell"
          variant="tertiary"
          onClick={openChangeOrder}
        >
          Open a change order
        </DocumentAction>
      )}
    </>
  );
}

/**
 * C-14 cell 2 — the quote (C-29). The line's live quote in one quiet sentence
 * ("quoted $1,840 · good through 30 October · Hewn ref Q-2291"), the act that
 * uses it, and the act that records one. Good-through is a date only (R6).
 */
export function QuoteCell({
  item,
  projectId,
  projectName,
  vendor,
  canEdit = false,
}: {
  item: FFERow;
  projectId: string;
  projectName: string;
  vendor: { id: string; name: string } | null;
  canEdit?: boolean;
}) {
  const { data: quotes } = useVendorQuotes(projectId);
  const quote = latestQuoteForLine(quotes, item.id);
  const onOrder = Boolean(item.purchase_order_id ?? item.purchase_order);
  const applied =
    quote !== null &&
    quote.appliedAt !== null &&
    item.trade_price_cents === quote.unitTradeCents;

  return (
    <UnfoldCell head="Quote" testId="line-quote-cell">
      {quote ? (
        <>
          <CellValue>{quoteSentence(quote, vendor?.id === quote.vendorId ? vendor.name : null)}</CellValue>
          {quote.leadTimeWeeks != null && (
            <CellSub>
              {quote.leadTimeWeeks === 1 ? '1 week' : `${quote.leadTimeWeeks} weeks`} lead
            </CellSub>
          )}
          {applied && <CellSub>trade cost is the quoted {fmtUsd(quote.unitTradeCents)}</CellSub>}
        </>
      ) : (
        <CellSub>No quote recorded</CellSub>
      )}
      {quote && !applied && !onOrder && canEdit && (
        <UseQuotedPrice quote={quote} itemId={item.id} projectId={projectId} />
      )}
      {!onOrder && canEdit && vendor && (
        <RecordQuoteAct
          item={item}
          projectId={projectId}
          projectName={projectName}
          vendor={vendor}
          supersedesQuoteId={quote?.vendorId === vendor.id ? quote.quoteId : null}
        />
      )}
    </UnfoldCell>
  );
}
