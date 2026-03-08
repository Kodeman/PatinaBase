'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './MilestoneCard.module.css';

interface Milestone {
  id: string;
  title: string;
  description: string;
  date: string;
  status: string;
  details?: string;
}

interface MilestoneCardProps {
  milestone: Milestone;
}

export function MilestoneCard({ milestone }: MilestoneCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Skip animations if reduced motion is preferred
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
            // Unobserve after first trigger
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.25, // Trigger when 25% visible
        rootMargin: '0px',
      }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
    };
  }, [isVisible, prefersReducedMotion]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const cardClassName = prefersReducedMotion
    ? `${styles.milestoneCard} ${styles.milestoneCardNoMotion}`
    : `${styles.milestoneCard} ${isVisible ? styles.milestoneCardVisible : styles.milestoneCardHidden}`;

  const detailsClassName = prefersReducedMotion
    ? `${styles.milestoneDetails} ${styles.milestoneDetailsNoMotion}`
    : `${styles.milestoneDetails} ${isExpanded ? styles.milestoneDetailsExpanded : styles.milestoneDetailsCollapsed}`;

  const statusClassName = `${styles.milestoneStatus} ${styles[`milestoneStatus${milestone.status.charAt(0).toUpperCase() + milestone.status.slice(1)}`]}`;

  return (
    <div
      ref={cardRef}
      className={cardClassName}
    >
      <div className={styles.milestoneDate}>
        {format(new Date(milestone.date), 'MMM d, yyyy')}
      </div>
      <h3 className={styles.milestoneTitle}>{milestone.title}</h3>
      <p className={styles.milestoneDescription}>{milestone.description}</p>
      <div className={statusClassName}>
        {milestone.status}
      </div>

      {milestone.details && (
        <>
          <button
            onClick={toggleExpanded}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
            className={styles.milestoneExpandButton}
          >
            <ChevronDown
              className={`${styles.milestoneArrow} ${isExpanded ? styles.milestoneArrowExpanded : styles.milestoneArrowCollapsed} ${
                prefersReducedMotion ? styles.milestoneArrowNoMotion : ''
              }`}
            />
            {isExpanded ? 'Show less' : 'Show more'}
          </button>

          <div
            ref={detailsRef}
            className={detailsClassName}
            style={{
              visibility: isExpanded || prefersReducedMotion ? 'visible' : 'hidden',
              height: isExpanded || !prefersReducedMotion ? 'auto' : '0',
            }}
          >
            <div className={styles.milestoneDetailsContent}>
              {milestone.details}
            </div>
          </div>
        </>
      )}
    </div>
  );
}