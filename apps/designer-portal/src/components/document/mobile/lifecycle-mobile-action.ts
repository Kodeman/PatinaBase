import type { MobilePrimaryAction } from './mobile-shell';

export const MOBILE_ACTION_PRIORITY = {
  letterhead: 0,
  guide: 5,
  lifecycle: 10,
} as const;

export function signedProposalMobileAction({
  projectId,
  isLoading,
  isPending,
  onActivate,
}: {
  projectId: string | null;
  isLoading: boolean;
  isPending: boolean;
  onActivate: () => void;
}): MobilePrimaryAction | null {
  if (projectId) {
    return {
      actionKey: 'open-project',
      surfaceKey: 'open-document',
      regionKey: 'signed-proposal',
      label: 'Open the project',
      target: { kind: 'href', href: `/doc/${projectId}` },
    };
  }
  if (isLoading) return null;
  return {
    actionKey: 'open-project',
    surfaceKey: 'open-document',
    regionKey: 'signed-proposal',
    label: 'Open the project',
    target: { kind: 'press', onPress: onActivate },
    loading: isPending,
  };
}
