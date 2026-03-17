'use client';

import React from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      variant = 'info',
      size = 'md',
      children,
      className = '',
      dot = false,
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center rounded-full font-medium border';

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs gap-1.5',
      md: 'px-3 py-1 text-sm gap-2',
    };

    const variantStyles = {
      success: 'bg-success-50 text-success-700 border-success-200',
      warning: 'bg-warning-50 text-warning-700 border-warning-200',
      danger: 'bg-red-50 text-red-700 border-red-200',
      info: 'bg-primary-50 text-primary-700 border-primary-200',
      neutral: 'bg-gray-100 text-gray-700 border-gray-200',
    };

    const dotColorMap = {
      success: 'bg-success-600',
      warning: 'bg-warning-600',
      danger: 'bg-red-600',
      info: 'bg-primary-600',
      neutral: 'bg-gray-400',
    };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      >
        {dot && (
          <div
            className={`w-1.5 h-1.5 rounded-full ${dotColorMap[variant]}`}
          />
        )}
        {children}
      </div>
    );
  }
);

Badge.displayName = 'Badge';
