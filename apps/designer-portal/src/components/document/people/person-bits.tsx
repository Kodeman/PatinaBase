'use client';

/**
 * Shared People-Room primitives: the role-tinted avatar, the role badge, and
 * the status dot. One source of truth so the directory, the profile, the
 * nurture queue, and the threads list all read identically. Zero shadows (D4);
 * colours come from the brand tokens (globals.css).
 */

import type { PartyRole } from '@patina/supabase';
import { roleLabel, type PartyStatus } from '@/lib/document/people-derivation';

const AVATAR_BG: Record<PartyRole, string> = {
  client: 'var(--color-sage)',
  maker: 'var(--color-aged-oak)',
  gc: 'var(--color-dusty-blue)',
  team: 'var(--color-clay)',
  lead: 'var(--color-terracotta)',
};

const BADGE: Record<PartyRole, { color: string; border: string }> = {
  client: { color: '#6f8268', border: 'var(--color-sage)' },
  maker: { color: 'var(--color-aged-oak)', border: '#cbb48f' },
  gc: { color: 'var(--color-dusty-blue)', border: 'var(--color-dusty-blue)' },
  team: { color: 'var(--color-clay)', border: 'var(--color-clay)' },
  lead: { color: 'var(--color-terracotta)', border: 'var(--color-terracotta)' },
};

const DOT_BG: Record<PartyStatus, string> = {
  active: 'var(--color-golden-hour)',
  warm: 'var(--color-sage)',
  due: 'var(--color-terracotta)',
  cool: 'var(--color-pearl)',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  name,
  role,
  size = 42,
}: {
  name: string;
  role: PartyRole;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: AVATAR_BG[role],
        fontSize: Math.round(size * 0.32),
      }}
    >
      {initials(name)}
    </span>
  );
}

export function RoleBadge({ role }: { role: PartyRole }) {
  const { color, border } = BADGE[role];
  return (
    <span
      className="rounded-[3px] border-[1.5px] px-2 py-[2px] font-mono text-[0.44rem] font-semibold uppercase tracking-[0.06em]"
      style={{ color, borderColor: border }}
    >
      {roleLabel(role)}
    </span>
  );
}

export function StatusDot({ status }: { status: PartyStatus }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: DOT_BG[status] }}
    />
  );
}
