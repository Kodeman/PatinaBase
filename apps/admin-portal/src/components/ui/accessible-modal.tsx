'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { X } from 'lucide-react';
import { Button } from './button';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

/**
 * AccessibleModal Component
 *
 * A fully accessible modal dialog component that follows WCAG 2.1 Level AA guidelines.
 *
 * Features:
 * - Focus trap - keeps keyboard focus within modal
 * - Escape key to close (configurable)
 * - Overlay click to close (configurable)
 * - Proper ARIA attributes for screen readers
 * - Focus restoration when closed
 * - Prevents body scroll when open
 *
 * @example
 * <AccessibleModal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Confirm Action"
 *   description="Are you sure you want to proceed?"
 * >
 *   <div>Modal content here</div>
 * </AccessibleModal>
 */
export function AccessibleModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
}: AccessibleModalProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Store the previously focused element and restore focus when modal closes
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = '';
        // Restore focus to the element that opened the modal
        previousFocusRef.current?.focus();
      };
    }
  }, [isOpen]);

  // Handle escape key press
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  // Size variants
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-[95vw]',
  };

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) {
      onClose();
    }
  };

  const handleContentClick = (e: React.MouseEvent) => {
    // Prevent click from bubbling to overlay
    e.stopPropagation();
  };

  return (
    <FocusTrap
      active={isOpen}
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false, // We handle escape ourselves
        fallbackFocus: () => modalRef.current || document.body,
      }}
    >
      <div
        className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,41,38,0.35)] backdrop-blur-[2px] animate-fade-in"
        onClick={handleOverlayClick}
        role="presentation"
        aria-hidden="true"
      >
        <div
          ref={modalRef}
          className={`modal-content relative bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-sm shadow-[0_8px_32px_rgba(44,41,38,0.12)] ${sizeClasses[size]} w-full mx-4 max-h-[90vh] overflow-y-auto animate-slide-in-from-bottom ${className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby={description ? 'modal-description' : undefined}
          onClick={handleContentClick}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between p-6 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
            <div className="flex-1 pr-8">
              <h2 id="modal-title" className="type-item-name leading-tight">
                {title}
              </h2>
              {description && (
                <p id="modal-description" className="type-body-small mt-1 text-[var(--text-muted)]">
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Close dialog"
                className="absolute top-4 right-4 h-8 w-8 p-0 rounded-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            )}
          </div>

          {/* Content */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </FocusTrap>
  );
}

/**
 * AccessibleModalFooter
 *
 * Optional footer component for modal actions
 */
export function AccessibleModalFooter({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-end gap-2 px-6 py-4 bg-[var(--bg-primary)] border-t border-[var(--border-subtle)] ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * AccessibleModalBody
 *
 * Optional body component for consistent spacing
 */
export function AccessibleModalBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`space-y-4 ${className}`}>{children}</div>;
}
