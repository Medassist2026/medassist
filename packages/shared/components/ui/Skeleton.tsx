'use client';

import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string;
  height?: string;
  className?: string;
  count?: number;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      variant = 'text',
      width,
      height,
      className = '',
      count = 1,
    },
    ref
  ) => {
    const baseStyles = 'bg-gray-200 animate-pulse';

    const variantStyles = {
      text: 'rounded h-4',
      circular: 'rounded-full',
      rectangular: 'rounded-lg',
    };

    const getDefaultDimensions = (): { w: string; h: string } => {
      switch (variant) {
        case 'circular':
          return { w: width || 'w-10', h: height || 'h-10' };
        case 'rectangular':
          return { w: width || 'w-full', h: height || 'h-32' };
        case 'text':
        default:
          return { w: width || 'w-full', h: height || 'h-4' };
      }
    };

    const dims = getDefaultDimensions();

    if (count > 1) {
      return (
        <div className={`space-y-2 ${className}`}>
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              ref={i === 0 ? ref : null}
              className={`${baseStyles} ${variantStyles[variant]} ${dims.w} ${dims.h}`}
            />
          ))}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${dims.w} ${dims.h} ${className}`}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';
