'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateClientScopeChangeRequest } from '@patina/supabase';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;

export default function ClientScopeChangeNewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const createRequest = useCreateClientScopeChangeRequest();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createRequest.mutateAsync({ projectId, title: title.trim(), description: description.trim() });
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
      {/* Header */}
      <div className="mb-8">
        <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
          Request a scope change
        </p>
        <h1 className="mb-2 font-serif text-3xl font-normal tracking-tight text-gray-900">
          Tell us what you'd like to change
        </h1>
        <p className="font-body text-sm leading-relaxed text-gray-500">
          Describe the change you have in mind. Your designer will review your request and follow
          up with any budget or timeline impact.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-body text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label
            htmlFor="title"
            className="mb-1 block font-mono text-[0.58rem] uppercase tracking-wider text-gray-500"
          >
            Change title <span className="text-gray-400">({title.length}/{TITLE_MAX})</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            placeholder="e.g. Add a reading nook to the master bedroom"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-body text-sm outline-none focus:border-gray-500"
          />
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="mb-1 block font-mono text-[0.58rem] uppercase tracking-wider text-gray-500"
          >
            Details <span className="text-gray-400">({description.length}/{DESCRIPTION_MAX})</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            placeholder="Describe the change you'd like and why it matters."
            required
            rows={6}
            className="min-h-[140px] w-full resize-y rounded-md border border-gray-300 px-3 py-2 font-body text-sm outline-none focus:border-gray-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={!title.trim() || !description.trim() || createRequest.isPending}
            className="rounded-md bg-gray-900 px-6 py-2.5 font-body text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {createRequest.isPending ? 'Sending…' : 'Submit request'}
          </button>
          <Link
            href={`/projects/${projectId}`}
            className="rounded-md border border-gray-300 px-6 py-2.5 font-body text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
