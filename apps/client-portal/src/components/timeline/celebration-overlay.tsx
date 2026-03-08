'use client';

/**
 * CelebrationOverlay - Shows milestone celebration animations
 * Uses progressive disclosure and achievement badges
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Star, PartyPopper, Medal, CheckCircle2 } from 'lucide-react';
import { Button, MediaCarousel } from '@patina/design-system';
import confetti from 'canvas-confetti';
import type { MilestoneCelebration } from '@/hooks/use-immersive-timeline';

interface CelebrationOverlayProps {
  celebration: MilestoneCelebration | null;
  onDismiss: () => void;
  onViewDetails?: (milestoneId: string) => void;
}

const achievementIcons = {
  first_milestone: Trophy,
  halfway: Medal,
  major_decision: Star,
  final_delivery: PartyPopper,
  on_time: CheckCircle2,
};

const achievementTitles = {
  first_milestone: 'First Milestone Achieved!',
  halfway: 'Halfway There!',
  major_decision: 'Major Decision Made!',
  final_delivery: 'Project Complete!',
  on_time: 'On-Time Delivery!',
};

const achievementColors = {
  first_milestone: 'from-amber-400 to-yellow-500',
  halfway: 'from-blue-400 to-indigo-500',
  major_decision: 'from-purple-400 to-pink-500',
  final_delivery: 'from-green-400 to-emerald-500',
  on_time: 'from-teal-400 to-cyan-500',
};

export function CelebrationOverlay({ celebration, onDismiss, onViewDetails }: CelebrationOverlayProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Trigger confetti on mount
  useEffect(() => {
    if (celebration) {
      // Fire confetti
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.8 },
          colors: ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.8 },
          colors: ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };

      frame();
    }
  }, [celebration]);

  if (!celebration) return null;

  const AchievementIcon = celebration.achievementType
    ? achievementIcons[celebration.achievementType]
    : Trophy;
  const achievementTitle = celebration.achievementType
    ? achievementTitles[celebration.achievementType]
    : 'Milestone Achieved!';
  const gradientColor = celebration.achievementType
    ? achievementColors[celebration.achievementType]
    : 'from-amber-400 to-yellow-500';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="relative w-full max-w-lg mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onDismiss}
            className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Main card */}
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
            {/* Achievement header */}
            <div className={`bg-gradient-to-br ${gradientColor} p-8 text-center text-white relative overflow-hidden`}>
              {/* Background decoration */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-1/4 w-32 h-32 rounded-full bg-white blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-24 h-24 rounded-full bg-white blur-2xl" />
              </div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="relative z-10"
              >
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-4">
                  <AchievementIcon className="h-10 w-10" />
                </div>
              </motion.div>

              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold mb-2 relative z-10"
              >
                {achievementTitle}
              </motion.h2>

              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-white/90 text-lg font-medium relative z-10"
              >
                {celebration.title}
              </motion.p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-4 text-sm text-white/80 relative z-10"
              >
                Milestone {celebration.milestoneNumber} of {celebration.totalMilestones}
              </motion.div>
            </div>

            {/* Content */}
            <div className="p-6">
              {celebration.designerMessage && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mb-6 p-4 bg-gray-50 rounded-xl"
                >
                  <p className="text-sm font-medium text-gray-600 mb-2">Message from your designer:</p>
                  <p className="text-gray-800 italic">"{celebration.designerMessage}"</p>
                </motion.div>
              )}

              {celebration.description && !showDetails && (
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="text-gray-600 mb-6"
                >
                  {celebration.description}
                </motion.p>
              )}

              {/* Media carousel */}
              {showDetails && celebration.celebrationMedia && celebration.celebrationMedia.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-6"
                >
                  <MediaCarousel
                    items={celebration.celebrationMedia.map(m => ({
                      id: m.id,
                      url: m.url,
                      type: m.type as 'image' | 'video',
                      caption: m.caption,
                      thumbnail: m.thumbnailUrl,
                    }))}
                    autoPlay={0}
                    showThumbnails={celebration.celebrationMedia.length > 1}
                    className="rounded-xl overflow-hidden"
                  />
                </motion.div>
              )}

              {/* Actions */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="flex gap-3"
              >
                {celebration.celebrationMedia && celebration.celebrationMedia.length > 0 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowDetails(!showDetails)}
                  >
                    {showDetails ? 'Hide Photos' : 'View Photos'}
                  </Button>
                )}
                <Button
                  className="flex-1"
                  onClick={() => {
                    onViewDetails?.(celebration.id);
                    onDismiss();
                  }}
                >
                  Continue Journey
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
