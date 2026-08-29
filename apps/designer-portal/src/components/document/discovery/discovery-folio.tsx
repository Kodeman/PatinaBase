'use client';

/**
 * The Discovery inspiration board (R66 / R24) — images clipped to the folio
 * at the Discovery stage, keyed on the relationship (designer_client_id, no
 * project yet; 00224). A gathering surface, not a versioned folio: a flat
 * strip of clips + an upload affordance. Zero shadows (D4).
 */

import { useEffect, useState } from 'react';
import {
  useDiscoveryFolioFiles,
  useUploadDiscoveryFolioFile,
  folioSignedUrl,
  type FolioFile,
} from '@/hooks/use-folio';

function Clip({ file }: { file: FolioFile }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (file.doc_type === 'img' && file.storage_path) {
      void folioSignedUrl(file.storage_path).then((u) => {
        if (alive) setUrl(u);
      });
    }
    return () => {
      alive = false;
    };
  }, [file.storage_path, file.doc_type]);

  return (
    <div className="flex h-[68px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-[var(--color-pearl)] bg-[rgba(243,238,228,0.6)] text-center font-mono text-[11px] text-[var(--text-muted)]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.title} className="h-full w-full object-cover" />
      ) : (
        <span className="px-1.5">{file.title}</span>
      )}
    </div>
  );
}

export function DiscoveryFolio({ designerClientId }: { designerClientId: string }) {
  const { data: files } = useDiscoveryFolioFiles(designerClientId);
  const upload = useUploadDiscoveryFolioFile(designerClientId);

  const onPick = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((file) => upload.mutate({ file }));
  };

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-2.5">
        {(files ?? []).map((f) => (
          <Clip key={f.id} file={f} />
        ))}
        <label className="flex h-[68px] w-[96px] shrink-0 cursor-pointer items-center justify-center rounded-[3px] border border-dashed border-[var(--color-pearl)] text-center font-mono text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--color-clay)] hover:text-[var(--color-charcoal)]">
          {upload.isPending ? 'Uploading…' : '＋ Add a pin'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPick(e.target.files)}
          />
        </label>
      </div>
    </div>
  );
}
