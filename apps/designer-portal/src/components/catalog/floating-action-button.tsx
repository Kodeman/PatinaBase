'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button, Badge } from '@patina/design-system';

export interface FloatingActionButtonProps {
  onClick: () => void;
  activeFilters?: number;
  isOpen?: boolean;
  label?: string;
}

export function FloatingActionButton({
  onClick,
  activeFilters = 0,
  isOpen = false,
  label = 'Filters',
}: FloatingActionButtonProps) {
  const shouldReduceMotion = useReducedMotion();

  const buttonVariants = {
    initial: {
      scale: 1,
    },
    hover: shouldReduceMotion ? {} : {
      scale: 1.05,
      transition: {
        duration: 0.2,
      },
    },
    tap: shouldReduceMotion ? {} : {
      scale: 0.95,
    },
  };

  const badgeVariants = {
    initial: {
      scale: 0,
    },
    animate: {
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 500,
        damping: 25,
      },
    },
    exit: {
      scale: 0,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <motion.div
      className="fixed bottom-20 right-6 z-40 sm:hidden"
      variants={buttonVariants}
      initial="initial"
      whileHover="hover"
      whileTap="tap"
    >
      <Button
        size="lg"
        className="h-14 px-6 rounded-full shadow-lg"
        onClick={onClick}
        aria-label={`${isOpen ? 'Close' : 'Open'} ${label.toLowerCase()}`}
      >
        {isOpen ? (
          <>
            <X className="h-5 w-5 mr-2" />
            Close
          </>
        ) : (
          <>
            <SlidersHorizontal className="h-5 w-5 mr-2" />
            {label}
          </>
        )}
        {activeFilters > 0 && !isOpen && (
          <motion.div
            variants={badgeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="ml-2"
          >
            <Badge variant="solid" className="bg-white text-primary">
              {activeFilters}
            </Badge>
          </motion.div>
        )}
      </Button>
    </motion.div>
  );
}
