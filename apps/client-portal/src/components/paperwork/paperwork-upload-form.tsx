'use client';

/**
 * ONE DOCUMENT, SENT (build/upload-door-spec.md §3, §5).
 *
 * Posts straight to the `paperwork-upload` edge function (public,
 * token-gated in-code, verify_jwt=false) with the anon key — there is no
 * session and no server action here; the 64-hex token minted by
 * `mint_paperwork_link` IS the authority the function checks, and the firm and
 * studio are read from the token row, never from this body. Content-Type is
 * left to the browser so the multipart boundary is set correctly, the same way
 * /evidence/[token]'s uploader does it.
 *
 * The function answers in the studio's own sentences ("send a PDF, a JPEG or a
 * PNG", "that file is over 15 MB", "give the date it expires"), so a refusal is
 * printed as it arrives rather than re-worded here.
 *
 * A waiver is upload only (§3): it already carries its signatures, so the form
 * asks for the file and nothing else.
 */

import { useRef, useState } from 'react';
import { Button } from '@patina/design-system';

const ACCEPTED_FILE_TYPES = 'application/pdf,image/jpeg,image/png';

export interface PaperworkUploadFormProps {
  token: string;
  docType: string;
  docLabel: string | null;
  title: string;
  /** A waiver asks for the file alone. */
  uploadOnly: boolean;
  /** 00623 refuses a certificate, a licence or a bond with no expiry. */
  expiryRequired: boolean;
  onReceived: () => void;
}

type FormState = 'idle' | 'sending' | 'error';

const FIELD_CLASS =
  'block w-full min-h-[44px] rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-base text-[var(--text-primary)]';

export function PaperworkUploadForm({
  token,
  docType,
  docLabel,
  title,
  uploadOnly,
  expiryRequired,
  onReceived,
}: PaperworkUploadFormProps) {
  const [state, setState] = useState<FormState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [number, setNumber] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fieldId = (name: string) => `paperwork-${docType}-${name}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;

    if (!file) {
      setState('error');
      setMessage('Choose the file first.');
      return;
    }

    // 00623 refuses a certificate, a licence or a bond with no expiry and the
    // door answers "give the date it expires" — asked here so the firm is not
    // sent a whole file to be told. The door remains the enforcement; this is
    // only the same sentence, sooner. The field is marked aria-required rather
    // than `required` so the browser never speaks its own caveat over the
    // studio's words.
    if (expiryRequired && !expiresOn) {
      setState('error');
      setMessage('Give the date it expires.');
      return;
    }

    setState('sending');
    setMessage(null);

    const body = new FormData();
    body.set('token', token);
    body.set('doc_type', docType);
    if (docLabel) body.set('doc_label', docLabel);
    if (!uploadOnly) {
      if (number.trim()) body.set('number', number.trim());
      if (issuer.trim()) body.set('issuer', issuer.trim());
      if (issuedOn) body.set('issued_on', issuedOn);
      if (expiresOn) body.set('expires_on', expiresOn);
    }
    body.set('file', file);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/paperwork-upload`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body,
      });
      const answer = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        setState('error');
        setMessage(
          typeof answer?.error === 'string'
            ? answer.error
            : 'That did not go through. Try again.',
        );
        return;
      }

      setState('idle');
      setMessage(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onReceived();
    } catch {
      setState('error');
      setMessage('That did not go through. Try again.');
    }
  }

  return (
    <form className="mt-3 space-y-3" onSubmit={handleSubmit} aria-label={`Add ${title}`}>
      <div>
        <label className="type-label block" htmlFor={fieldId('file')}>
          File
        </label>
        <input
          ref={fileRef}
          id={fieldId('file')}
          name="file"
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className={`${FIELD_CLASS} mt-1`}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>

      {!uploadOnly && (
        <>
          <div>
            <label className="type-label block" htmlFor={fieldId('number')}>
              Number
            </label>
            <input
              id={fieldId('number')}
              name="number"
              type="text"
              inputMode="text"
              autoComplete="off"
              className={`${FIELD_CLASS} mt-1`}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
          </div>

          <div>
            <label className="type-label block" htmlFor={fieldId('issuer')}>
              Issuer
            </label>
            <input
              id={fieldId('issuer')}
              name="issuer"
              type="text"
              autoComplete="off"
              className={`${FIELD_CLASS} mt-1`}
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
            />
          </div>

          <div>
            <label className="type-label block" htmlFor={fieldId('issued_on')}>
              Issued
            </label>
            <input
              id={fieldId('issued_on')}
              name="issued_on"
              type="date"
              className={`${FIELD_CLASS} mt-1`}
              value={issuedOn}
              onChange={(event) => setIssuedOn(event.target.value)}
            />
          </div>

          <div>
            <label className="type-label block" htmlFor={fieldId('expires_on')}>
              Expires
            </label>
            <input
              id={fieldId('expires_on')}
              name="expires_on"
              type="date"
              aria-required={expiryRequired}
              className={`${FIELD_CLASS} mt-1`}
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
            />
          </div>
        </>
      )}

      <Button
        type="submit"
        size="lg"
        className="min-h-[44px] w-full"
        aria-disabled={state === 'sending'}
      >
        {state === 'sending' ? 'Sending…' : `Send ${title}`}
      </Button>

      {state === 'error' && message && (
        <p className="type-body-small text-[var(--terracotta-ink)]" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
