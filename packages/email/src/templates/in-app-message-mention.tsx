import * as React from 'react';
import { InAppMessage } from './in-app-message';
import type { InAppMessageProps } from './in-app-message';

/**
 * Mention-specific email is the same component with `isMention=true` forced.
 * Splitting the file keeps the type registry clean (one template per type)
 * and lets the renderer pick the file by ID without a runtime branch.
 */
export type InAppMessageMentionProps = Omit<InAppMessageProps, 'isMention'>;

export const InAppMessageMention: React.FC<InAppMessageMentionProps> = (
  props,
) => <InAppMessage {...props} isMention />;

export default InAppMessageMention;
