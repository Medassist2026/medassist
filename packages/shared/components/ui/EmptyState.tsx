'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from './Button';

interface ActionConfig {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: ActionConfig;
  className?: string;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon,
      title,
      description,
      action,
      className = '',
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`flex flex-col items-center justify-center py-12 ${className}`}
      >
        {icon && (
          <div className="w-16 h-16 text-gray-300 mx-auto mb-4 flex items-center justify-center">
            {icon}
          </div>
        )}

        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {title}
        </h3>

        {description && (
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto text-center">
            {description}
          </p>
        )}

        {action && (
          <div>
            {action.href ? (
              <Link href={action.href}>
                <Button variant="primary" size="md">
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';
