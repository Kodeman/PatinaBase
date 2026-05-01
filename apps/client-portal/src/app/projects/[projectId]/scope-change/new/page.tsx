'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useCreateClientScopeChangeRequest } from '@patina/supabase';
import { ChangeRequestForm, type ChangeRequestFormData } from '@patina/design-system';

export default function ClientScopeChangeNewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const createRequest = useCreateClientScopeChangeRequest();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: ChangeRequestFormData) {
    setError(null);
    try {
      await createRequest.mutateAsync({
        projectId,
        title: data.title.trim(),
        description: data.description.trim(),
      });
      setSubmitted(true);
      setTimeout(() => {
        router.push(`/projects/${projectId}`);
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
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
          Describe the change you have in mind. Your designer will review your request and follow
          up with any budget or timeline impact.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-body text-sm text-red-700">{error}</p>
        </div>
      )}

      <ChangeRequestForm
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/projects/${projectId}`)}
      />

      <p className="mt-4 text-xs text-gray-500">
        <Link href={`/projects/${projectId}`} className="underline">
          Cancel and return to your project
        </Link>
      </p>
    </div>
  );
}
