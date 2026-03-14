'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  ProgressRing,
  Tag,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@patina/design-system';
import { Calendar, Users, MessageSquare, Bell, TrendingUp, Clock, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import Image from 'next/image';

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

  // Get online team members
  const onlineTeamMembers = teamPresence.filter(p => p.status === 'online');

  // Recent activities to display
  const displayActivities = showAllActivities ? activities : activities.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Hero Section with Background Image */}
      <Card className="relative overflow-hidden">
        {project.heroImage && (
          <div className="absolute inset-0 z-0">
            <Image
              src={project.heroImage}
              alt={project.name}
              fill
              className="object-cover opacity-20"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/90 to-transparent" />
          </div>
        )}

        <div className="relative z-10 p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Project Info */}
            <div className="max-w-2xl">
              <p className="text-sm uppercase tracking-[0.4em] text-[var(--color-muted)]">
                Project overview
              </p>
              <h1 className="mt-3 font-[var(--font-playfair)] text-4xl text-[var(--color-text)]">
                {project.name}
              </h1>

              {project.summary && (
                <p className="mt-4 text-base text-[var(--color-muted)]">{project.summary}</p>
              )}

              {/* Project Metadata Tags */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {project.currentPhase && (
                  <Badge variant="subtle" color="neutral" className="px-4 py-1.5">
                    Phase: {project.currentPhase}
                  </Badge>
                )}

                {project.startDate && project.endDate && (
                  <Tag variant="outline" className="gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(project.startDate)} - {formatDate(project.endDate)}
                  </Tag>
                )}

                {project.budget && (
                  <Tag variant="outline">
                    Budget: {formatCurrency(project.budget, project.currency || 'USD')}
                  </Tag>
                )}

                <Tag variant="outline">
                  {project.completedMilestones} of {project.totalMilestones} milestones
                </Tag>
              </div>

              {/* Action Indicators */}
              <div className="mt-6 flex items-center gap-4">
                {project.approvalsPending && project.approvalsPending > 0 && (
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <Badge variant="subtle" color="warning" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {project.approvalsPending} Pending Approval{project.approvalsPending > 1 ? 's' : ''}
                    </Badge>
                  </motion.div>
                )}

                {project.unreadMessages && project.unreadMessages > 0 && (
                  <Badge variant="subtle" color="info" className="gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {project.unreadMessages} Unread Message{project.unreadMessages > 1 ? 's' : ''}
                  </Badge>
                )}

                {onlineTeamMembers.length > 0 && (
                  <Badge variant="subtle" color="success" className="gap-1">
                    <Users className="h-3 w-3" />
                    {onlineTeamMembers.length} Team Member{onlineTeamMembers.length > 1 ? 's' : ''} Online
                  </Badge>
                )}
              </div>
            </div>

            {/* Progress Section */}
            <div className="flex flex-col items-center gap-6">
              {/* Circular Progress Ring */}
              <div className="relative">
                <ProgressRing
                  value={project.progressPercentage}
                  size="xl"
                  strokeWidth={12}
                  className="text-[var(--color-accent)]"
                  showLabel={false}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-[var(--color-text)]">
                    {formatPercentage(project.progressPercentage)}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                    Complete
                  </span>
                </div>
              </div>

              {/* Next Milestone Card */}
              {project.nextMilestone && (
                <Card className="w-full max-w-xs p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-[var(--color-muted)]" />
                    <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                      Next Milestone
                    </span>
                  </div>
                  <p className="font-medium text-sm text-[var(--color-text)]">
                    {project.nextMilestone.title}
                  </p>
                  {project.nextMilestone.targetDate && (
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      Due {formatDate(project.nextMilestone.targetDate)}
                    </p>
                  )}
                  <Badge
                    variant="subtle"
                    color={project.nextMilestone.status === 'attention' ? 'warning' : 'neutral'}
                    className="mt-2"
                  >
                    {formatStatusLabel(project.nextMilestone.status as any)}
                  </Badge>
                </Card>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Team & Activity Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Members */}
        {project.team && project.team.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--color-text)]">Project Team</h3>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {project.team.length} members
              </Badge>
            </div>

            <div className="space-y-3">
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
                            className="border-2 border-white"
                            status={isOnline ? 'online' : undefined}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {member.name} - {member.role}{isOnline ? ' (Online)' : ''}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </AvatarGroup>

              <div className="pt-3 border-t">
                <p className="text-sm text-[var(--color-muted)]">
                  Your dedicated team is here to bring your vision to life.
                  {onlineTeamMembers.length > 0 && (
                    <span className="text-green-600 font-medium">
                      {' '}• {onlineTeamMembers.length} available now
                    </span>
                  )}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Recent Activity Feed */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--color-text)]">Recent Activity</h3>
            <Badge variant="outline" className="gap-1">
              <TrendingUp className="h-3 w-3" />
              Live
            </Badge>
          </div>

          <AnimatePresence mode="popLayout">
            {displayActivities.length > 0 ? (
              <div className="space-y-3">
                {displayActivities.map((activity) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-1">
                      {activity.type === 'milestone' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {activity.type === 'message' && <MessageSquare className="h-4 w-4 text-blue-500" />}
                      {activity.type === 'approval' && <AlertCircle className="h-4 w-4 text-amber-500" />}
                      {activity.type === 'document' && <FileText className="h-4 w-4 text-gray-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text)]">{activity.title}</p>
                      {activity.description && (
                        <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
                          {activity.description}
                        </p>
                      )}
                      <p className="text-xs text-[var(--color-muted)] mt-1">
                        {formatRelativeTime(activity.createdAt)}
                      </p>
                    </div>
                  </motion.div>
                ))}

                {activities.length > 3 && !showAllActivities && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllActivities(true)}
                    className="w-full"
                  >
                    Show all ({activities.length} total)
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--color-muted)]">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
                <p className="text-xs mt-1">Updates will appear here in real-time</p>
              </div>
            )}
          </AnimatePresence>
        </Card>
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