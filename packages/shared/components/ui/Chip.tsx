'use client';

import React from 'react';

interface ChipProps {
  label: string;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onRemove?: () => void;
  variant?: 'selectable' | 'removable';
  size?: 'sm' | 'md';
  className?: string;
  sublabel?: string;
}

export const Chip = React.forwardRef<HTMLDivElement, ChipProps>(
  (
    {
      label,
      selected = false,
      onSelect,
      onRemove,
      variant = 'selectable',
      size = 'md',
      className = '',
      sublabel,
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center gap-2 rounded-full font-medium transition-all duration-150 active:scale-[0.97]';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
    };

    const selectableStyles = selected
      ? 'bg-primary-600 text-white cursor-pointer hover:bg-primary-700'
      : 'bg-gray-100 text-gray-700 cursor-pointer hover:bg-gray-200';

    const removableStyles = 'bg-primary-600 text-white cursor-pointer hover:bg-primary-700';

    const variantStyles = {
      selectable: selectableStyles,
      removable: removableStyles,
    };

    const handleClick = () => {
      if (variant === 'selectable' && onSelect) {
        onSelect(!selected);
      }
    };

    return (
      <div
        ref={ref}
        onClick={handleClick}
        className={`inline-block ${className}`}
      >
        <div
          className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} flex-col items-start`}
        >
          <span>{label}</span>
          {sublabel && (
            <span className="text-xs opacity-75 font-normal">{sublabel}</span>
          )}
          {variant === 'removable' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
              }}
              className="ml-auto text-white hover:opacity-75 transition-opacity"
              type="button"
              aria-label={`Remove ${label}`}
            >
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }
);

Chip.displayName = 'Chip';
