'use client';

import { useState } from 'react';
import type { ExceptionCaseFileDTO } from '@patina/fulfillment';
import { useMintEvidenceLink } from '@/hooks/use-fulfillment-exceptions';
import { useToast } from '@/components/portal/toast-provider';

// Evidence grid (S7, spec §5.5) — the case file's photos, from signed R2 URLs
// (a missing object 404s on <img>, rendered as a labelled placeholder tile,
// matching the presentation's IMG 01/02/03 look). "Generate client upload link"
// mints a ~72h token and shows the copyable URL the operator hands the client;
// the client uploads through the token-gated flow, never the admin surface.

const labelCls = 'text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]';

function EvidenceTile({ url, index }: { url: string | null; index: number }) {
  const [failed, setFailed] = useState(false);
  const showImg = url && !failed;
  return (
    <div
      className="flex aspect-square items-center justify-center overflow-hidden border bg-[var(--bg-hover)]"
      style={{ borderColor: 'var(--border-subtle)' }}
      data-testid="evidence-tile"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Evidence ${index + 1}`} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-[0.6rem] tracking-[0.1em] text-[var(--text-subtle)]" style={{ fontFamily: 'var(--font-meta)' }}>
          IMG {String(index + 1).padStart(2, '0')}
        </span>
      )}
    </div>
  );
}

export function EvidenceGrid({ caseFile }: { caseFile: ExceptionCaseFileDTO }) {
  const { toast } = useToast();
  const mint = useMintEvidenceLink(caseFile.id);
  const [link, setLink] = useState<string | null>(null);

  const generate = async () => {
    try {
      const res = await mint.mutateAsync();
      setLink(res.url);
      try {
        await navigator.clipboard.writeText(res.url);
        toast('Upload link copied to clipboard', 'success');
      } catch {
        toast('Upload link ready', 'success');
      }
    } catch (e) {
      toast((e as Error).message || 'Failed to mint link', 'error');
    }
  };

  return (
    <div className="mt-4" data-testid="evidence-grid">
      <div className="flex items-center justify-between">
        <span className={labelCls}>Evidence</span>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={mint.isPending}
          data-testid="evidence-generate-link"
          className="type-btn-text text-[var(--accent-primary)] disabled:opacity-40"
        >
          Generate client upload link
        </button>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {caseFile.evidence.length === 0 ? (
          <div className="col-span-4 py-3 text-[0.85rem] italic text-[var(--text-muted)] sm:col-span-6">
            No photos yet — send the client an upload link.
          </div>
        ) : (
          caseFile.evidence.map((e, i) => <EvidenceTile key={e.key} url={e.url} index={i} />)
        )}
      </div>

      {link && (
        <div
          className="mt-2 break-all border p-2 text-[0.75rem]"
          style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-meta)' }}
          data-testid="evidence-link-url"
        >
          {link}
        </div>
      )}
    </div>
  );
}
