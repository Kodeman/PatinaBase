/** U1 — Recent captures. This session's history + a quick library search. */
import { useEffect, useState } from 'react';
import { OverlaySheet } from '../panel/OverlaySheet';
import { getRecent, type RecentCapture } from '../lib/recent-captures';
import { supabase } from '../lib/supabase';

interface LibraryHit {
  id: string;
  name: string;
  image: string | null;
}

const TARGET_LABEL: Record<RecentCapture['target'], string> = {
  library: 'Library',
  inbox: 'Inbox',
  decision: 'Decision',
  update: 'Updated',
};

function Row({ name, sub, thumb }: { name: string; sub: string; thumb: string | null }) {
  return (
    <li className="flex items-center gap-2.5 border-b border-line py-2">
      <span className="h-9 w-9 flex-none overflow-hidden rounded-sm border border-line bg-paper-3">
        {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.85rem] text-ink">{name}</span>
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-ink-soft">
          {sub}
        </span>
      </span>
    </li>
  );
}

export function RecentCapturesSheet() {
  const [recent, setRecent] = useState<RecentCapture[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LibraryHit[]>([]);

  useEffect(() => {
    getRecent().then(setRecent);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, images')
        .is('deleted_at', null)
        .ilike('name', `%${q}%`)
        .order('captured_at', { ascending: false })
        .limit(20);
      if (!active) return;
      setHits(
        (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          image: Array.isArray(p.images) ? (p.images[0] ?? null) : null,
        }))
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <OverlaySheet title="Recent">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your library…"
        className="mb-3 w-full rounded-md border border-line bg-paper-3 px-2.5 py-2 text-[0.85rem] text-ink outline-none focus:border-verdigris"
      />
      {query.trim().length >= 2 ? (
        <ul className="space-y-0">
          {hits.length === 0 ? (
            <p className="py-6 text-center text-[0.82rem] text-ink-soft">No matches.</p>
          ) : (
            hits.map((h) => <Row key={h.id} name={h.name} sub="Library" thumb={h.image} />)
          )}
        </ul>
      ) : recent.length === 0 ? (
        <p className="py-6 text-center text-[0.82rem] text-ink-soft">
          Nothing captured yet this session.
        </p>
      ) : (
        <ul className="space-y-0">
          {recent.map((r) => (
            <Row
              key={r.productId + r.capturedAt}
              name={r.name}
              sub={`${TARGET_LABEL[r.target]} · ${new Date(r.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
              thumb={r.thumbnail}
            />
          ))}
        </ul>
      )}
    </OverlaySheet>
  );
}
