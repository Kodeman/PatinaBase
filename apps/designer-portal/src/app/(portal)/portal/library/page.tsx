'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'library_last_layer';

/**
 * /portal/library root — restores the user's last-selected layer from
 * localStorage and redirects there. Defaults to Personal (PRD §5.2).
 *
 * Renders a transient placeholder for the brief paint between mount and
 * router.replace. Server-side persistence (cookies) is intentionally
 * deferred — this is a per-device preference, not account-level.
 */
export default function LibraryIndexPage() {
  const router = useRouter();

  useEffect(() => {
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage may be unavailable (incognito, browser quotas). Fall
      // through to the default.
    }
    const target =
      last === 'studio' || last === 'catalog' || last === 'personal' ? last : 'personal';
    router.replace(`/portal/library/${target}`);
  }, [router]);

  return null;
}
