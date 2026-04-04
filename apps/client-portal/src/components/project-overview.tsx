'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Avatar,
  AvatarGroup,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@patina/design-system';
import { Calendar, Users, MessageSquare, Clock, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import Image from 'next/image';

import { StrataMark } from '@/components/strata-mark';
import { useActivityFeed, useTeamPresence } from '@/lib/websocket';
import { formatDate, formatPercentage, formatRelativeTime, formatStatusLabel } from '@/lib/utils/format';

interface ProjectOverviewProps {
  project: {
    id: string;
    name: string;
    summary?: string;
    currentPhase?: string;
    status: string;
    progressPercentage: number;
    completedMilestones: number;
    totalMilestones: number;
    approvalsPending?: number;
    unreadMessages?: number;
    startDate?: string;
    endDate?: string;
    budget?: number;
    currency?: string;
    heroImage?: string;
    nextMilestone?: {
      id: string;
      title: string;
      targetDate?: string;
      status: string;
    };
    team?: Array<{
      id: string;
      name: string;
      role: string;
      avatar?: string;
      email?: string;
    }>;
  };
}

export function ProjectOverview({ project }: ProjectOverviewProps) {
  const activities = useActivityFeed();
  const teamPresence = useTeamPresence();
  const [showAllActivities, setShowAllActivities] = useState(false);

  const onlineTeamMembers = teamPresence.filter(p => p.status === 'online');
  const displayActivities = showAllActivities ? activities : activities.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Hero Section */}
      <div className="relative">
        {project.heroImage && (
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-[3px]">
            <Image
              src={project.heroImage}
              alt={project.name}
              fill
              className="object-cover opacity-10"
              priority
            />
          </div>
        )}

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          {/* Project Info */}
          <div className="max-w-2xl">
            <p className="type-meta">Project overview</p>
            <h1 className="type-page-title mt-3">{project.name}</h1>

            {project.summary && (
              <p className="type-body mt-4">{project.summary}</p>
            )}

            {/* Metadata as mono text */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              {project.currentPhase && (
                <span className="type-meta">Phase: {project.currentPhase}</span>
              )}
              {project.startDate && project.endDate && (
                <span className="type-meta flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(project.startDate)} – {formatDate(project.endDate)}
                </span>
              )}
              {project.budget && (
                <span className="type-meta">
                  Budget: {formatCurrency(project.budget, project.currency || 'USD')}
                </span>
              )}
              <span className="type-meta">
                {project.completedMilestones} of {project.totalMilestones} milestones
              </span>
            </div>

            {/* Action Indicators */}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {project.approvalsPending && project.approvalsPending > 0 && (
                <span className="type-meta text-patina-terracotta flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {project.approvalsPending} Pending Approval{project.approvalsPending > 1 ? 's' : ''}
                </span>
              )}
              {project.unreadMessages && project.unreadMessages > 0 && (
                <span className="type-meta text-patina-dusty-blue flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {project.unreadMessages} Unread
                </span>
              )}
              {onlineTeamMembers.length > 0 && (
                <span className="type-meta text-patina-sage flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {onlineTeamMembers.length} Online
                </span>
              )}
            </div>
          </div>

          {/* Progress + Next Milestone */}
          <div className="flex flex-col items-end gap-6">
            <div className="text-right">
              <span className="type-data-large">{Math.round(project.progressPercentage)}</span>
              <span className="type-meta ml-2">% complete</span>
            </div>

            {project.nextMilestone && (
              <div className="border-t border-[var(--border-default)] pt-4">
                <p className="type-meta-small flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Next milestone
                </p>
                <p className="type-item-name mt-1">{project.nextMilestone.title}</p>
                {project.nextMilestone.targetDate && (
                  <p className="type-meta mt-1">Due {formatDate(project.nextMilestone.targetDate)}</p>
                )}
                <p className={`type-meta mt-1 ${project.nextMilestone.status === 'attention' ? 'text-patina-terracotta' : ''}`}>
                  {formatStatusLabel(project.nextMilestone.status as any)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <StrataMark variant="mini" />

      {/* Team & Activity */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Team Members */}
        {project.team && project.team.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="type-section-head">Your Team</h3>
              <span className="type-meta">{project.team.length} members</span>
            </div>

            <AvatarGroup max={5}>
              {project.team.map((member) => {
                const isOnline = teamPresence.some(p => p.userId === member.id && p.status === 'online');
                return (
                  <Tooltip key={member.id}>
                    <TooltipTrigger asChild>
                      <div className="relative">
                        <Avatar
                          src={member.avatar}
                          alt={member.name}
                          name={member.name}
                          className="border-2 border-[var(--bg-primary)]"
                          status={isOnline ? 'online' : undefined}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {member.name} — {member.role}{isOnline ? ' (Online)' : ''}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </AvatarGroup>

            <p className="type-body-small mt-4">
              Your dedicated team is here to bring your vision to life.
              {onlineTeamMembers.length > 0 && (
                <span className="text-patina-sage font-medium">
                  {' '}· {onlineTeamMembers.length} available now
                </span>
              )}
            </p>
          </div>
        )}

        {/* Recent Activity Feed */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="type-section-head">Recent Activity</h3>
            <span className="type-meta text-patina-sage">Live</span>
          </div>

          <AnimatePresence mode="popLayout">
            {displayActivities.length > 0 ? (
              <div>
                {displayActivities.map((activity) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-3 border-b border-[var(--border-subtle)] py-3"
                  >
                    <div className="mt-0.5">
                      {activity.type === 'milestone' && <CheckCircle className="h-4 w-4 text-patina-sage" />}
                      {activity.type === 'message' && <MessageSquare className="h-4 w-4 text-patina-dusty-blue" />}
                      {activity.type === 'approval' && <AlertCircle className="h-4 w-4 text-patina-terracotta" />}
                      {activity.type === 'document' && <FileText className="h-4 w-4 text-patina-aged-oak" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)]">{activity.title}</p>
                      {activity.description && (
                        <p className="type-body-small mt-0.5 truncate">{activity.description}</p>
                      )}
                      <p className="type-meta-small mt-1">{formatRelativeTime(activity.createdAt)}</p>
                    </div>
                  </motion.div>
                ))}

                {activities.length > 3 && !showAllActivities && (
                  <button
                    type="button"
                    onClick={() => setShowAllActivities(true)}
                    className="mt-3 type-meta text-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Show all ({activities.length} total)
                  </button>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Clock className="h-6 w-6 mx-auto mb-2 text-[var(--text-muted)] opacity-50" />
                <p className="type-body-small">No recent activity</p>
                <p className="type-meta mt-1">Updates will appear here in real-time</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}
