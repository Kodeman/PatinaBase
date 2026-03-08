'use server';

import { revalidatePath } from 'next/cache';

import { getCommsClient, getProjectsClient } from '../../../lib/api-client';

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function submitApprovalAction(params: {
  projectId: string;
  approvalId: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
  comment?: string;
}): Promise<ActionResult> {
  try {
    await getProjectsClient().submitApproval(
      params.projectId,
      params.approvalId,
      params.decision,
      params.comment
    );

    await getProjectsClient().logEngagement(params.projectId, {
      event: 'client_portal.approval_submitted',
      metadata: {
        approvalId: params.approvalId,
        decision: params.decision,
      },
    });

    revalidatePath(`/projects/${params.projectId}`);
    return { success: true };
  } catch (error) {
    console.error('[client-portal] failed to submit approval', error);
    return { success: false, error: 'We could not submit your decision. Please try again.' };
  }
}

export async function postMessageAction(params: {
  projectId: string;
  threadId: string;
  body: string;
}): Promise<ActionResult> {
  try {
    if (!params.body.trim()) {
      return { success: false, error: 'Message cannot be empty.' };
    }

    await getCommsClient().createMessage(params.threadId, {
      bodyText: params.body,
    });

    await getProjectsClient().logEngagement(params.projectId, {
      event: 'client_portal.message_posted',
      metadata: {
        threadId: params.threadId,
      },
    });

    revalidatePath(`/projects/${params.projectId}`);
    return { success: true };
  } catch (error) {
    console.error('[client-portal] failed to post message', error);
    return { success: false, error: 'Unable to post message right now. Please try again.' };
  }
}

export async function logEngagementAction(params: {
  projectId: string;
  event: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getProjectsClient().logEngagement(params.projectId, {
      event: params.event,
      metadata: params.metadata,
    });
  } catch (error) {
    console.warn('[client-portal] failed to log engagement', error);
  }
}
