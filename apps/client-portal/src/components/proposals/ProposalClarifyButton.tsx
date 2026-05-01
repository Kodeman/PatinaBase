'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

import { useStartProjectThread } from '@patina/supabase';
import { Button } from '@patina/design-system';

interface ProposalClarifyButtonProps {
  projectId: string;
}

export function ProposalClarifyButton({ projectId }: ProposalClarifyButtonProps) {
  const router = useRouter();
  const startThread = useStartProjectThread();

  async function onClick() {
    try {
      const threadId = await startThread.mutateAsync(projectId);
      router.push(`/messages?thread=${threadId}`);
    } catch (err) {
      console.error('Failed to start thread', err);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={startThread.isPending}
      data-testid="proposal-clarify"
    >
      <MessageSquare className="mr-2 h-4 w-4" />
      {startThread.isPending ? 'Opening…' : 'Ask a question'}
    </Button>
  );
}
