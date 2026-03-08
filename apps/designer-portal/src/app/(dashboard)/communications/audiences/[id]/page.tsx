'use client';

import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function EditAudiencePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <button
          onClick={() => router.push('/communications/audiences')}
          className="flex items-center gap-1 text-sm text-patina-clay-beige hover:text-patina-charcoal mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Audiences
        </button>
        <h1 className="text-2xl font-display font-semibold text-patina-charcoal">Edit Segment</h1>
        <p className="text-sm text-patina-clay-beige mt-1">Segment {id.slice(0, 8)}...</p>
      </div>
      <div className="px-8 py-6">
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12 text-center">
          <p className="text-patina-clay-beige">Segment editor — coming in WS5</p>
        </div>
      </div>
    </div>
  );
}
