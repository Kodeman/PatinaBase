export const FOCUS_PROJECT_APPROVAL_EVENT =
  'document:focus-project-approval' as const;

export interface FocusProjectApprovalDetail {
  decisionId: string;
}

export function focusProjectApproval(decisionId: string): void {
  window.dispatchEvent(
    new CustomEvent<FocusProjectApprovalDetail>(FOCUS_PROJECT_APPROVAL_EVENT, {
      detail: { decisionId },
    }),
  );
}
