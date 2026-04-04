'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useCallback } from 'react';

interface LeadListItemProps {
  id: string;
  clientName: string;
  projectType: string;
  location: string;
  budgetRange: string;
  responseDeadline: string;
  matchScore: number;
  onAccept?: (id: string) => void;
  onPass?: (id: string) => void;
}

const SWIPE_THRESHOLD = 80;

export function LeadListItem({
  id,
  clientName,
  projectType,
  location,
  budgetRange,
  responseDeadline,
  matchScore,
  onAccept,
  onPass,
}: LeadListItemProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Only start swiping if horizontal movement > vertical
    if (!isSwiping.current && Math.abs(deltaX) > 10) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        isSwiping.current = true;
      } else {
        return;
      }
    }

    if (isSwiping.current) {
      e.preventDefault();
      setSwipeX(deltaX);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeX > SWIPE_THRESHOLD && onAccept) {
      onAccept(id);
    } else if (swipeX < -SWIPE_THRESHOLD && onPass) {
      onPass(id);
    }
    setSwipeX(0);
    isSwiping.current = false;
  }, [swipeX, onAccept, onPass, id]);

  const handleClick = useCallback(() => {
    if (!isSwiping.current) {
      router.push(`/portal/leads/${id}`);
    }
  }, [router, id]);

  const swipeActive = Math.abs(swipeX) > 20;

  return (
    <div
      className="relative overflow-hidden border-b border-[var(--border-subtle)]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Swipe background layers (mobile) */}
      {swipeActive && (
        <>
          {swipeX > 0 && (
            <div className="absolute inset-0 flex items-center pl-6 md:hidden" style={{ backgroundColor: 'var(--color-sage)' }}>
              <span className="type-btn-text text-white">Accept</span>
            </div>
          )}
          {swipeX < 0 && (
            <div className="absolute inset-0 flex items-center justify-end pr-6 md:hidden" style={{ backgroundColor: 'var(--color-terracotta)' }}>
              <span className="type-btn-text text-white">Pass</span>
            </div>
          )}
        </>
      )}

      {/* Content layer */}
      <div
        className="group relative grid cursor-pointer grid-cols-[1fr_auto] gap-4 bg-[var(--bg-primary)] px-0 py-5 transition-all hover:bg-[var(--bg-hover)] hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
        style={{
          transitionDuration: 'var(--duration-fast)',
          transform: swipeX !== 0 ? `translateX(${swipeX}px)` : undefined,
          transition: swipeX === 0 ? 'transform 200ms var(--ease-spring)' : 'none',
        }}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left side */}
        <div className="min-w-0">
          <div className="type-label">{clientName}</div>
          <div className="type-label-secondary mt-0.5">
            {[projectType, location, budgetRange, responseDeadline]
              .filter(Boolean)
              .join(' \u00B7 ')}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Hover actions (desktop) */}
          <div
            className="hidden items-center gap-2 md:flex"
            style={{
              opacity: isHovered ? 1 : 0,
              transition: `opacity var(--duration-fast) var(--ease-default)`,
            }}
          >
            {onAccept && (
              <button
                className="type-btn-text text-[var(--color-sage)] hover:text-[var(--text-primary)]"
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept(id);
                }}
              >
                Accept
              </button>
            )}
            {onPass && (
              <button
                className="type-btn-text text-[var(--text-muted)] hover:text-[var(--color-terracotta)]"
                onClick={(e) => {
                  e.stopPropagation();
                  onPass(id);
                }}
              >
                Pass
              </button>
            )}
          </div>

          {/* Score */}
          <div className="flex flex-col items-end">
            <span className="type-data-large text-[var(--accent-primary)]">
              {matchScore}
            </span>
            <span className="type-meta-small">Match</span>
          </div>
        </div>
      </div>
    </div>
  );
}
