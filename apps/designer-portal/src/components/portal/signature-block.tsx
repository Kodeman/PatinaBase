'use client';

interface SignatureBlockProps {
  label: string; // "Client Signature" or "Designer Signature"
  name: string; // "Sarah & James Whitfield"
  preSignedName?: string; // Designer's pre-filled italic signature
}

export function SignatureBlock({ label, name, preSignedName }: SignatureBlockProps) {
  return (
    <div className="flex min-h-[100px] flex-col items-center justify-center rounded-md border border-[var(--color-pearl)] p-6 text-center">
      <div
        className="mb-2"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.55rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      {preSignedName && (
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: '1.1rem',
            color: 'var(--accent-primary)',
            marginTop: '0.25rem',
          }}
        >
          {preSignedName}
        </div>
      )}
      <div
        className="mt-4 mb-1.5"
        style={{
          width: 200,
          height: 1,
          background: 'var(--text-primary)',
        }}
      />
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.55rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        {name} &middot; Date
      </div>
    </div>
  );
}
