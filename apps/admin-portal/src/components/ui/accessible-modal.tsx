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
        className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={handleOverlayClick}
        role="presentation"
        aria-hidden="true"
      >
        <div
          ref={modalRef}
          className={`modal-content relative bg-white dark:bg-gray-800 rounded-lg shadow-xl ${sizeClasses[size]} w-full mx-4 max-h-[90vh] overflow-y-auto animate-slide-in-from-bottom ${className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby={description ? 'modal-description' : undefined}
          onClick={handleContentClick}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex-1 pr-8">
              <h2
                id="modal-title"
                className="text-xl font-semibold text-gray-900 dark:text-white"
              >
                {title}
              </h2>
              {description && (
                <p
                  id="modal-description"
                  className="mt-1 text-sm text-gray-600 dark:text-gray-400"
                >
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
                className="absolute top-4 right-4 h-8 w-8 p-0 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
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
      className={`flex items-center justify-end gap-2 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 ${className}`}
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
