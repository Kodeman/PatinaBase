'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EditProductRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/portal/catalog/${id}?mode=edit`);
  }, [id, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <span className="type-meta animate-pulse">Redirecting to edit mode...</span>
    </div>
  );
}
