'use client'

import * as React from 'react'

// ============================================================================
// TYPES — minimal, self-contained. No @patina/supabase imports.
// ============================================================================

export interface ScopeRoomEntry {
  name: string
  room_type: string | null
  /** Per-room budget in CENTS. */
  budget_cents: number
}

export interface ScopeRoomsBlockProps {
  rooms: ScopeRoomEntry[]
}

function currency(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars)
}

/**
 * Per-room budget breakdown. Returns null when empty so the caller can hide
 * the surrounding section header.
 */
export function ScopeRoomsBlock({ rooms }: ScopeRoomsBlockProps) {
  if (rooms.length === 0) return null

  return (
    <ul className="mt-4 space-y-3">
      {rooms.map((room, i) => (
        <li
          key={`${room.name}-${i}`}
          className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5"
        >
          <div className="min-w-0">
            <p className="type-body-small font-medium text-[var(--text-primary)]">
              {room.name}
            </p>
            {room.room_type && (
              <p className="type-meta-small text-[var(--text-muted)]">{room.room_type}</p>
            )}
          </div>
          <span className="type-meta text-[var(--text-primary)]">
            {currency(room.budget_cents / 100)}
          </span>
        </li>
      ))}
    </ul>
  )
}

ScopeRoomsBlock.displayName = 'ScopeRoomsBlock'
