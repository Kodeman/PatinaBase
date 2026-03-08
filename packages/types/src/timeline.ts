export interface TimelineMilestone {
  id: string;
  title: string;
  description: string;
  date: string;
  status: 'completed' | 'in-progress' | 'upcoming';
  details?: string;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
  }>;
}

export interface TimelineProject {
  id: string;
  name: string;
  description: string;
  milestones: TimelineMilestone[];
  startDate: string;
  endDate?: string;
  status: 'active' | 'completed' | 'on-hold';
}

export interface TimelineOptions {
  enableAnimations?: boolean;
  staggerDelay?: number;
  scrollThreshold?: number;
  headerFadeDistance?: number;
}