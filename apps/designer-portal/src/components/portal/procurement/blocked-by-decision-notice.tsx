'use client';

/**
 * BlockedByDecisionNotice — shared procurement messaging for FF&E items that
 * are held by a pending `blocks_procurement` client decision (Decision
 * Framework, PT-D-2-T3).
 *
 * The DB guard + `project_ffe_items.blocked_by_decision_id` wiring already
 * exist (migrations 00084 / 00085 — `apply_decision` clears the block when the
 * client responds). This component is the *UI enforcement + messaging* half:
 *
 *   • Inline in the order controls (OrderAssistant / OrderViaPatina) it tells
 *     the designer *why* ordering is disabled and links to the decision so they
 *     can chase the client.
 *   • As a rollup on the procurement / project views it surfaces
 *     "N items blocked pending a decision" with the same deep link.
 *
 * A single blocked item resolves to a single decision link. When several items
 * are blocked by different decisions we link to the project's decisions list
 * instead (the caller supplies `projectId`).
 */

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

// ─── Shared blocked-item shape ──────────────────────────────────────────────

/**
 * The minimal slice of a `project_ffe_items` row this module needs to reason
 * about blocking. `blocked` is the boolean flag; `blocked_by_decision_id` is
 * the FK to the pending decision; `blocked_reason` is the human-readable note
 * the decision feed-through stamps onto the item.
 */
export interface BlockableFFEItem {
  id: string;
  name?: string | null;
  blocked?: boolean | null;
  blocked_by_decision_id?: string | null;
  blocked_reason?: string | null;
}

/**
 * Returns the subset of `items` that are currently blocked by a pending
 * decision. An item counts as blocked only when BOTH `blocked` is truthy and a
 * `blocked_by_decision_id` is present — a stale `blocked` flag with no decision
 * link is treated as orderable (defence against half-cleared rows).
 */
export function getBlockedItems<T extends BlockableFFEItem>(items: T[]): T[] {
  return items.filter((i) => Boolean(i.blocked) && Boolean(i.blocked_by_decision_id));
}

/**
 * Distinct `blocked_by_decision_id` values across the supplied blocked items.
 * One distinct id ⇒ link straight to that decision; more than one ⇒ link to the
 * project decisions list.
 */
export function distinctBlockingDecisionIds<T extends BlockableFFEItem>(
  items: T[],
): string[] {
  const set = new Set<string>();
  for (const i of items) {
    if (i.blocked_by_decision_id) set.add(i.blocked_by_decision_id);
  }
  return Array.from(set);
}

// ─── Inline order-control banner ────────────────────────────────────────────

export interface BlockedByDecisionInlineProps {
  /** The blocked items driving this notice (already filtered via getBlockedItems). */
  blockedItems: BlockableFFEItem[];
  /**
   * Project the items belong to. Used to build the decisions-list deep link
   * when the blocked items span more than one decision.
   */
  projectId?: string;
  className?: string;
}

/**
 * Builds the deep link target for a set of blocked items.
 *
 * R21 dissolve: there is no decisions zone any more. A single distinct decision
 * opens the DOCUMENT it belongs to — /doc/[decisionId] resolves through
 * use-document-state's third leg (client_decisions.id → project_id) and the
 * decision unfolds in the margin. Several decisions have no one document to
 * name, so they land on the Desk, where the blocked project waits as a folder.
 * (`projectId` is still accepted for a future scoped deep link; it is not
 * encoded today.)
 */
export function blockedDecisionHref(
  blockedItems: BlockableFFEItem[],
  _projectId?: string,
): { href: string; isSingle: boolean } {
  const ids = distinctBlockingDecisionIds(blockedItems);
  if (ids.length === 1) {
    return { href: `/doc/${ids[0]}`, isSingle: true };
  }
  return { href: '/desk', isSingle: false };
}

/**
 * Inline banner rendered inside an order control (OrderAssistant footer area,
 * OrderViaPatina body) when one or more of the items being ordered is blocked.
 * Explains the hold and links to the blocking decision. Pairs with a disabled
 * submit button in the host component.
 */
export function BlockedByDecisionInline({
  blockedItems,
  projectId,
  className,
}: BlockedByDecisionInlineProps) {
  if (blockedItems.length === 0) return null;

  const count = blockedItems.length;
  const { href, isSingle } = blockedDecisionHref(blockedItems, projectId);
  // When a single item is blocked, surface its specific reason; for several we
  // keep the message generic and lean on the link.
  const reason =
    count === 1 ? blockedItems[0]?.blocked_reason?.trim() || null : null;

  return (
    <div
      role="alert"
      className={`rounded-[4px] border px-3 py-2.5 text-[0.72rem] leading-relaxed ${className ?? ''}`}
      style={{
        borderColor: 'var(--color-terracotta, #D4A090)',
        background: 'rgba(212, 160, 144, 0.08)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
          style={{ color: 'var(--color-terracotta, #D4A090)' }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="font-medium">
            {count === 1
              ? 'This item is blocked pending a client decision.'
              : `${count} items are blocked pending a client decision.`}
          </div>
          {reason && (
            <p className="mt-0.5 text-[var(--text-muted)]">{reason}</p>
          )}
          <p className="mt-1 text-[var(--text-muted)]">
            Ordering is disabled until the decision is resolved.{' '}
            <Link
              href={href}
              className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
              style={{ color: 'var(--color-terracotta, #D4A090)' }}
            >
              {isSingle ? 'View the decision' : 'View blocking decisions'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Rollup notice (procurement / project views) ────────────────────────────

export interface BlockedItemsRollupProps {
  /** Number of FF&E items currently blocked pending a decision. */
  count: number;
  /**
   * Project scope. Accepted for a future scoped decisions-list deep link; not
   * encoded today (the list ignores a project param).
   */
  projectId?: string;
  /**
   * When all blocked items trace to a single decision, link straight to it.
   * Otherwise omit and the rollup links to the decisions list.
   */
  decisionId?: string;
  className?: string;
}

/**
 * Compact "N items blocked pending a decision" rollup for the procurement and
 * project views (PT-D-2-T3-2). Renders nothing when `count` is 0 so callers can
 * mount it unconditionally.
 */
export function BlockedItemsRollup({
  count,
  projectId: _projectId,
  decisionId,
  className,
}: BlockedItemsRollupProps) {
  if (count <= 0) return null;

  const href = decisionId ? `/doc/${decisionId}` : '/desk';

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[0.68rem] font-medium transition-colors ${className ?? ''}`}
      style={{
        borderColor: 'var(--color-terracotta, #D4A090)',
        background: 'rgba(212, 160, 144, 0.08)',
        color: 'var(--color-terracotta, #D4A090)',
      }}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {count} item{count === 1 ? '' : 's'} blocked pending a decision
    </Link>
  );
}
