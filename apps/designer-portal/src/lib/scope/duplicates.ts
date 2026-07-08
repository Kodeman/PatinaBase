/**
 * Duplicate detection (Track S · S7) — within ONE document, two lines that
 * share a product_id OR a non-empty doc_code are "twins". Pure client-side
 * derivation over the already-loaded items; it never blocks (imports must never
 * break), it only surfaces a quiet inline chip with a jump-to-twin.
 */

export interface TwinCandidate {
  id: string;
  product_id?: string | null;
  doc_code?: string | null;
  scope_room_id?: string | null;
  name?: string | null;
}

export interface TwinRef {
  /** The other line's id (jump target). */
  id: string;
  /** The other line's doc_code, if any (chip prefers this). */
  docCode: string | null;
  /** The other line's room name, resolved by the caller. */
  roomName: string | null;
  /** The other line's name (chip fallback when it has no doc_code). */
  name: string | null;
  /** Why they're twins. */
  reason: 'product' | 'doc_code';
}

function norm(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase();
}

/**
 * Map of itemId → its twins (deduped by the other line's id; a pair matched on
 * BOTH product and code lists once, preferring the 'doc_code' reason). Returns
 * only entries that have at least one twin.
 */
export function findScheduleTwins(
  items: TwinCandidate[],
  roomName: (roomId: string | null | undefined) => string | null
): Map<string, TwinRef[]> {
  const byProduct = new Map<string, TwinCandidate[]>();
  const byCode = new Map<string, TwinCandidate[]>();

  for (const it of items) {
    if (it.product_id) {
      const arr = byProduct.get(it.product_id) ?? [];
      arr.push(it);
      byProduct.set(it.product_id, arr);
    }
    const code = norm(it.doc_code);
    if (code) {
      const arr = byCode.get(code) ?? [];
      arr.push(it);
      byCode.set(code, arr);
    }
  }

  // itemId → (otherId → TwinRef). Nested map dedupes and lets doc_code win.
  const twins = new Map<string, Map<string, TwinRef>>();

  const link = (a: TwinCandidate, b: TwinCandidate, reason: TwinRef['reason']) => {
    if (a.id === b.id) return;
    let inner = twins.get(a.id);
    if (!inner) {
      inner = new Map();
      twins.set(a.id, inner);
    }
    const existing = inner.get(b.id);
    // doc_code is the stronger signal — don't downgrade it to 'product'.
    if (existing && existing.reason === 'doc_code') return;
    inner.set(b.id, {
      id: b.id,
      docCode: (b.doc_code ?? '').trim() || null,
      roomName: roomName(b.scope_room_id),
      name: (b.name ?? '').trim() || null,
      reason,
    });
  };

  for (const group of byProduct.values()) {
    if (group.length < 2) continue;
    for (const a of group) for (const b of group) link(a, b, 'product');
  }
  for (const group of byCode.values()) {
    if (group.length < 2) continue;
    for (const a of group) for (const b of group) link(a, b, 'doc_code');
  }

  const out = new Map<string, TwinRef[]>();
  for (const [id, inner] of twins) {
    if (inner.size > 0) out.set(id, Array.from(inner.values()));
  }
  return out;
}
