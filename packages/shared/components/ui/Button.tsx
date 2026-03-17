'use client';

import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      children,
      className = '',
      onClick,
      type = 'button',
    },
    ref
  ) => {
    const baseStyles =
      'rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-base min-h-[44px]',
    };

    const variantStyles = {
      primary:
        'bg-primary-600 hover:bg-primary-700 text-white shadow-soft hover:shadow-hover',
      secondary:
        'bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50',
      ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
      danger: 'bg-red-600 hover:bg-red-700 text-white shadow-soft hover:shadow-hover',
      success: 'bg-success-600 hover:bg-success-700 text-white shadow-soft hover:shadow-hover',
    };

    const isDisabledOrLoading = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabledOrLoading}
        onClick={onClick}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      >
        {loading && (
          <svg
            className="w-4 h-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {loading ? 'Loading...' : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
