'use client';

interface ReadReceiptProps {
  messageCreatedAt: string;
  otherLastReadAt: string | null | undefined;
}

export function ReadReceipt({ messageCreatedAt, otherLastReadAt }: ReadReceiptProps) {
  const isRead =
    !!otherLastReadAt && new Date(otherLastReadAt) >= new Date(messageCreatedAt);
  return (
    <span
      className="text-xs text-[var(--text-muted)]"
      data-testid="message-read-receipt"
      aria-label={isRead ? 'Read' : 'Delivered'}
    >
      {isRead ? 'Read' : 'Delivered'}
    </span>
  );
}
