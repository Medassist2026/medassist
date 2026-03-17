'use client';

import React from 'react';

interface CardProps {
  variant?: 'default' | 'elevated' | 'interactive';
  padding?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      className = '',
      children,
      onClick,
    },
    ref
  ) => {
    const baseStyles = 'bg-white rounded-xl border border-gray-100';

    const variantStyles = {
      default: `${baseStyles} shadow-soft`,
      elevated: `${baseStyles} shadow-card`,
      interactive: `${baseStyles} shadow-soft hover:shadow-hover transition-shadow cursor-pointer`,
    };

    const paddingStyles = {
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
    };

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={`${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
