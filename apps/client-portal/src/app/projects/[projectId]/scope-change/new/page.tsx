'use client';

import { use, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import {
  COMPLETED_PROJECT_SCOPE_CHANGE_ERROR,
  useCreateClientScopeChangeRequest,
  useProjectV2,
} from '@patina/supabase';
import { ChangeRequestForm, type ChangeRequestFormData } from '@patina/design-system';
import { QueryFailure } from '@/components/query-failure';

type SubmissionIntent = {
  version: 1;
  projectId: string;
  fingerprint: string;
  idempotencyKey: string;
};

const intentStorageKey = (projectId: string) => `patina:scope-change-intent:${projectId}`;

function readSubmissionIntent(projectId: string, fingerprint: string): SubmissionIntent | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(intentStorageKey(projectId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SubmissionIntent>;
    if (
      value.version !== 1 ||
      value.projectId !== projectId ||
      value.fingerprint !== fingerprint ||
      typeof value.idempotencyKey !== 'string' ||
      value.idempotencyKey.length === 0
    ) {
      return null;
    }
    return value as SubmissionIntent;
  } catch {
    return null;
  }
}

function persistSubmissionIntent(intent: SubmissionIntent): void {
  try {
    globalThis.sessionStorage?.setItem(intentStorageKey(intent.projectId), JSON.stringify(intent));
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // in-memory ref still protects retries for the lifetime of this mount.
  }
}

function clearSubmissionIntent(intent: SubmissionIntent): void {
  try {
    const persisted = readSubmissionIntent(intent.projectId, intent.fingerprint);
    if (persisted?.idempotencyKey === intent.idempotencyKey) {
      globalThis.sessionStorage?.removeItem(intentStorageKey(intent.projectId));
    }
  } catch {
    // The server receipt already proved the commit; stale session data is safe
    // and will be replaced when the user authors a different fingerprint.
  }
}

export default function ClientScopeChangeNewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const projectQuery = useProjectV2(projectId);
  const createRequest = useCreateClientScopeChangeRequest();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionIntentRef = useRef<SubmissionIntent | null>(null);
  const submittingRef = useRef(false);

  async function handleSubmit(data: ChangeRequestFormData) {
    // React Query's isPending reaches the next render; the ref closes the
    // same-tick double-click window before that render occurs.
    if (submittingRef.current) return;
    submittingRef.current = true;

    const title = data.title.trim();
    const description = data.description.trim();
    const fingerprint = JSON.stringify([title, description]);
    let submissionIntent = submissionIntentRef.current;
    if (submissionIntent?.fingerprint !== fingerprint) {
      submissionIntent =
        readSubmissionIntent(projectId, fingerprint) ??
        {
          version: 1,
          projectId,
          fingerprint,
          idempotencyKey: globalThis.crypto.randomUUID(),
        };
      persistSubmissionIntent(submissionIntent);
      submissionIntentRef.current = submissionIntent;
    }

    setError(null);
    try {
      await createRequest.mutateAsync({
        projectId,
        idempotencyKey: submissionIntent.idempotencyKey,
        title,
        description,
      });
      // A committed RPC receipt is the only point where this intent key can be
      // discarded. Network/unknown failures keep it stable across a reload for
      // a safe retry of the exact same authored payload.
      clearSubmissionIntent(submissionIntent);
      submissionIntentRef.current = null;
      setSubmitted(true);
      setTimeout(() => {
        router.push(`/projects/${projectId}`);
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      submittingRef.current = false;
    }
  }

  if (projectQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20" aria-label="Loading project">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (projectQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <QueryFailure
          title="Unable to check this project"
          message="The project could not be checked before opening a change request."
          onRetry={projectQuery.refetch}
        />
      </div>
    );
  }

  if (!projectQuery.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="font-body text-sm text-gray-700">Project not found.</p>
        <Link href="/projects" className="mt-4 inline-block underline">
          Back to projects
        </Link>
      </div>
    );
  }

  if (projectQuery.data.status === 'completed' || projectQuery.data.status === 'archived') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
          Project complete
        </p>
        <h1 className="font-serif text-3xl font-normal tracking-tight text-gray-900">
          This project&rsquo;s scope is closed
        </h1>
        <p className="mx-auto mt-3 max-w-lg font-body text-sm leading-relaxed text-gray-600">
          {COMPLETED_PROJECT_SCOPE_CHANGE_ERROR} Contact your designer if something still needs
          attention.
        </p>
        <Link href={`/projects/${projectId}`} className="mt-6 inline-block underline">
          Return to your project
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div
          className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
            Request sent
          </p>
          <p className="font-body text-sm leading-relaxed text-gray-700">
            Your change request was sent. Your designer will review it and update the scope and
            timeline.
          </p>
          <p className="mt-4 font-mono text-[0.6rem] text-gray-400">Returning to your project…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
          Request a scope change
        </p>
        <h1 className="mb-2 font-serif text-3xl font-normal tracking-tight text-gray-900">
          Tell us what you&rsquo;d like to change
        </h1>
        <p className="font-body text-sm leading-relaxed text-gray-500">
          Describe the change you have in mind. Your designer will review your request and follow up
          with any budget or timeline impact.
        </p>
      </div>

      {error && (
        <div
          className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-body text-sm text-red-700">{error}</p>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {createRequest.isPending ? 'Sending your change request…' : ''}
      </p>

      <ChangeRequestForm
        mode="basic"
        isSubmitting={createRequest.isPending}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/projects/${projectId}`)}
      />

      {!createRequest.isPending && (
        <p className="mt-4 text-xs text-gray-500">
          <Link href={`/projects/${projectId}`} className="underline">
            Cancel and return to your project
          </Link>
        </p>
      )}
    </div>
  );
}
