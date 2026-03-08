'use client';

import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { useStaggeredAnimation } from '../../hooks/useStaggeredAnimation';
import { MilestoneCard } from './MilestoneCard';
import styles from './ProjectTimeline.module.css';

interface Milestone {
  id: string;
  title: string;
  description: string;
  date: string;
  status: string;
  details?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  milestones: Milestone[];
}

interface ProjectTimelineProps {
  project: Project;
}

export function ProjectTimeline({ project }: ProjectTimelineProps) {
  const { headerOpacity, isDarkBackground } = useTimelineScroll();
  const { getDelayVar } = useStaggeredAnimation({
    itemCount: project.milestones.length,
    staggerMs: 150,
    maxDelayMs: 600,
  });

  return (
    <div className={styles.timelineContainer}>
      {/* Fixed header that fades out */}
      <div
        className={`${styles.timelineHeader} ${isDarkBackground ? styles.timelineHeaderDark : ''}`}
        style={{ opacity: headerOpacity }}
      >
        <div className={styles.timelineHeaderContent}>
          <h1>{project.name}</h1>
          <p>{project.description}</p>
        </div>
      </div>

      {/* Dark overlay that fades in */}
      <div
        className={styles.timelineOverlay}
        style={{ opacity: isDarkBackground ? 0.7 : 0 }}
      />

      {/* Project overview section */}
      <section className={styles.timelineOverview}>
        <div className={styles.timelineOverviewContent}>
          <h2>Project Overview</h2>
          <div className={styles.overviewGrid}>
            <div className={styles.overviewStat}>
              <span className={styles.statLabel}>Total Milestones</span>
              <span className={styles.statValue}>{project.milestones.length}</span>
            </div>
            <div className={styles.overviewStat}>
              <span className={styles.statLabel}>Status</span>
              <span className={styles.statValue}>Active</span>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline section with milestone cards */}
      <section className={styles.timelineSection}>
        <div className={styles.timelineContent}>
          <h2 className={styles.timelineTitle}>Project Timeline</h2>
          <div className={styles.timelineMilestones}>
            {project.milestones.map((milestone, index) => (
              <div
                key={milestone.id}
                style={{
                  animationDelay: getDelayVar(index),
                }}
                className={styles.milestoneWrapper}
              >
                <MilestoneCard milestone={milestone} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}