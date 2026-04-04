'use client';

import { useState } from 'react';
import { useSelectDecisionOption } from '@patina/supabase';
import type { ClientDecision, ClientDecisionOption, DecisionType, BlockingStatus } from '@patina/supabase';
import { CheckCircle2 } from 'lucide-react';

const typeLabels: Record<DecisionType, string> = {
  material: 'Material',
  product: 'Product',
  layout: 'Layout',
  budget: 'Budget',
  approval: 'Approval',
};

const typeIcons: Record<DecisionType, string> = {
  material: '\uD83C\uDFA8',
  product: '\uD83E\uDE91',
  layout: '\uD83D\uDCD0',
  budget: '\uD83D\uDCB0',
  approval: '\u2713',
};

interface DecisionCardClientProps {
  decision: ClientDecision;
  compact?: boolean;
}

function formatDueDate(date: string | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(decision: ClientDecision): boolean {
  return decision.status === 'pending' && !!decision.due_date && new Date(decision.due_date) < new Date();
}

function overdueDays(decision: ClientDecision): number | null {
  if (!isOverdue(decision)) return null;
  const diff = Date.now() - new Date(decision.due_date!).getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatPriceWithQuantity(price: number, quantity: number): string {
  const unit = formatPrice(price);
  if (quantity > 1) {
    return `${unit} \u00D7 ${quantity} = ${formatPrice(price * quantity)}`;
  }
  return unit;
}

function TypeBadge({ type }: { type: DecisionType }) {
  return (
    <span className="inline-flex items-center gap-1 type-meta-small text-[var(--accent-primary)]">
      {typeIcons[type]} {typeLabels[type]}
    </span>
  );
}

function ConnectionLine({ decision, resolved }: { decision: ClientDecision; resolved?: boolean }) {
  const { blocking_status, linked_phase } = decision;
  const isBlocking = blocking_status && blocking_status !== 'non_blocking';

  if (resolved && isBlocking) {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded px-3 py-2"
        style={{
          background: 'rgba(122, 155, 118, 0.04)',
          border: '1px solid rgba(122, 155, 118, 0.12)',
        }}
      >
        <span className="text-xs text-patina-sage">{'\u2713'}</span>
        <span className="text-xs text-[var(--text-body)]">
          Unblocked &middot; Ready to proceed
        </span>
      </div>
    );
  }

  if (resolved && linked_phase) {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded px-3 py-2"
        style={{
          background: 'rgba(122, 155, 118, 0.04)',
          border: '1px solid rgba(122, 155, 118, 0.12)',
        }}
      >
        <span className="text-xs text-patina-sage">{'\u2713'}</span>
        <span className="text-xs text-[var(--text-body)]">
          Linked: {linked_phase}
        </span>
      </div>
    );
  }

  if (!resolved && blocking_status === 'blocks_procurement') {
    return (
      <div
        className="flex items-center gap-2 rounded px-3 py-2"
        style={{
          background: 'rgba(199, 123, 110, 0.04)',
          border: '1px solid rgba(199, 123, 110, 0.12)',
        }}
      >
        <span className="text-xs" style={{ color: 'var(--color-terracotta, #D4A090)' }}>{'\u26A1'}</span>
        <span className="text-xs text-[var(--text-body)]">
          Blocking: {linked_phase || 'Procurement'} &middot; This decision is needed before ordering can proceed
        </span>
      </div>
    );
  }

  if (!resolved && blocking_status === 'blocks_phase') {
    return (
      <div
        className="flex items-center gap-2 rounded px-3 py-2"
        style={{
          background: 'rgba(199, 123, 110, 0.04)',
          border: '1px solid rgba(199, 123, 110, 0.12)',
        }}
      >
        <span className="text-xs" style={{ color: 'var(--color-terracotta, #D4A090)' }}>{'\u26A1'}</span>
        <span className="text-xs text-[var(--text-body)]">
          Blocking: {linked_phase || 'Next phase'} phase advancement
        </span>
      </div>
    );
  }

  if (!resolved && blocking_status === 'non_blocking' && linked_phase) {
    return (
      <div
        className="flex items-center gap-2 rounded px-3 py-2"
        style={{
          background: 'rgba(139, 156, 173, 0.04)',
          border: '1px solid rgba(139, 156, 173, 0.12)',
        }}
      >
        <span className="text-xs" style={{ color: 'var(--color-dusty-blue, #8B9CAD)' }}>{'\u25CE'}</span>
        <span className="text-xs text-[var(--text-body)]">
          Linked: {linked_phase} &middot; Non-blocking
        </span>
      </div>
    );
  }

  return null;
}

export function DecisionCardClient({ decision, compact }: DecisionCardClientProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [clientNote, setClientNote] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const selectOption = useSelectDecisionOption();

  const isResolved = decision.status === 'responded';
  const overdue = isOverdue(decision);
  const days = overdueDays(decision);
  const selectedOption = decision.options?.find((o) => o.selected);
  const options = decision.options?.sort((a, b) => a.sort_order - b.sort_order) ?? [];

  const handleSelect = (optionId: string) => {
    if (isResolved) return;
    setSelectedOptionId(optionId);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (!selectedOptionId) return;
    selectOption.mutate(
      { optionId: selectedOptionId, decisionId: decision.id, clientNote: clientNote.trim() || undefined },
      { onSuccess: () => setShowConfirm(false) }
    );
  };

  // Resolved compact display
  if (isResolved && compact && selectedOption) {
    return (
      <div className="border-b border-[var(--border-default)] py-4">
        <p className="type-meta text-patina-sage flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Decision Resolved
        </p>
        <p className="text-sm font-medium text-[var(--text-primary)] mt-1">
          {decision.title} &rarr; {selectedOption.name}
        </p>
        {selectedOption.price != null && (
          <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
            {formatPriceWithQuantity(selectedOption.price, selectedOption.quantity)}
          </p>
        )}
        {decision.decision_type && (
          <div className="mt-1">
            <TypeBadge type={decision.decision_type} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--border-default)] py-6">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`type-meta ${isResolved ? 'text-patina-sage' : 'text-[var(--accent-primary)]'}`}>
              {isResolved ? 'Decision Resolved \u2713' : 'Decision Request'}
            </span>
            {decision.decision_type && <TypeBadge type={decision.decision_type} />}
          </div>
          {decision.due_date && !isResolved && (
            <span className={`type-meta ${overdue ? 'text-patina-terracotta' : ''}`}>
              {overdue
                ? `Overdue ${days} ${days === 1 ? 'day' : 'days'}`
                : `Due ${formatDueDate(decision.due_date)}`}
            </span>
          )}
        </div>
        <h3 className="font-heading text-lg text-[var(--text-primary)]">
          {decision.title}
        </h3>
        {decision.context && (
          <p className="type-body-small mt-1">
            {decision.context}
          </p>
        )}
      </div>

      {/* Options */}
      <div className="grid gap-3 py-4" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, 1fr)` }}>
        {options.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            isSelected={option.selected || option.id === selectedOptionId}
            isResolved={isResolved}
            onSelect={() => handleSelect(option.id)}
          />
        ))}
      </div>

      {/* Connection / blocking line (pending) */}
      {!isResolved && <ConnectionLine decision={decision} />}

      {/* Confirm selection */}
      {showConfirm && !isResolved && selectedOptionId && (
        <div className="border-t border-[var(--border-default)] pt-4 mt-3">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
            Confirm your selection: {options.find((o) => o.id === selectedOptionId)?.name}
          </p>
          <textarea
            value={clientNote}
            onChange={(e) => setClientNote(e.target.value)}
            placeholder="Add a note (optional)"
            rows={2}
            className="mb-3 w-full resize-none rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:focus-ring"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectOption.isPending}
              className="inline-flex items-center gap-2 rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {selectOption.isPending ? 'Submitting...' : 'Confirm Selection'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false);
                setSelectedOptionId(null);
              }}
              className="rounded-[3px] border border-[var(--border-default)] px-4 py-2.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resolved info */}
      {isResolved && selectedOption && (
        <div className="border-t border-[var(--border-default)] pt-3">
          <p className="type-meta text-patina-sage flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Selected by you &middot; {selectedOption.name}
            {selectedOption.price != null && (
              <span className="text-[var(--text-muted)]">
                &middot; {formatPriceWithQuantity(selectedOption.price, selectedOption.quantity)}
              </span>
            )}
          </p>
          {selectedOption.client_note && (
            <p className="mt-1 text-xs italic text-[var(--text-muted)]">
              &ldquo;{selectedOption.client_note}&rdquo;
            </p>
          )}
          <ConnectionLine decision={decision} resolved />
        </div>
      )}

      {/* Instruction line */}
      {!isResolved && !showConfirm && (
        <p className="type-meta-small pt-2">
          Tap an option to select &middot; You can add a note with your choice
        </p>
      )}
    </div>
  );
}

function OptionCard({
  option,
  isSelected,
  isResolved,
  onSelect,
}: {
  option: ClientDecisionOption;
  isSelected: boolean;
  isResolved: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isResolved}
      className={`relative rounded-[3px] border p-4 text-left transition ${
        isResolved ? 'cursor-default' : 'cursor-pointer hover:border-[var(--accent-primary)]'
      } ${isSelected ? 'border-patina-sage bg-[rgba(168,181,160,0.06)]' : 'border-[var(--border-default)] bg-[var(--bg-surface)]'}`}
      style={{ opacity: isResolved && !isSelected ? 0.5 : 1 }}
    >
      {isSelected && (
        <span className="absolute right-2 top-2 type-meta-small text-patina-sage">
          {'\u2713'} Selected
        </span>
      )}

      {/* Image */}
      {option.image_url ? (
        <div
          className="mb-3 h-16 w-full rounded-[3px]"
          style={{
            backgroundImage: `url(${option.image_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : (
        <div className="mb-3 h-16 w-full rounded-[3px] bg-[var(--border-default)]" />
      )}

      <p className="text-sm font-medium text-[var(--text-primary)]">{option.name}</p>

      {option.price != null && (
        <p className="mt-0.5 font-heading text-base font-semibold text-[var(--text-primary)]">
          {formatPrice(option.price)}
          <span className="ml-1 font-sans text-xs font-normal text-[var(--text-muted)]">each</span>
        </p>
      )}

      {option.designer_note && (
        <p className="type-body-small mt-1">
          {option.designer_note}
        </p>
      )}

      {option.is_recommended && (
        <span className="mt-2 inline-flex items-center gap-1 type-meta-small text-[var(--accent-primary)]">
          &#9733; Your Designer&apos;s Recommendation
        </span>
      )}
    </button>
  );
}
