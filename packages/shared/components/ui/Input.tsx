'use client';

import React, { useState } from 'react';

interface InputProps {
  label?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'date' | 'time';
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      type = 'text',
      value,
      onChange,
      placeholder,
      error,
      icon,
      rightIcon,
      disabled = false,
      className = '',
      id,
      name,
      required = false,
      min,
      max,
      step,
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== '';
    const showLabel = isFocused || hasValue;

    const inputId = id || name || `input-${Math.random()}`;

    return (
      <div className={`relative w-full ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`absolute left-3 pointer-events-none font-medium transition-all duration-200 ${
              icon ? 'left-10' : 'left-3'
            } ${
              showLabel
                ? 'top-1.5 text-xs text-gray-600'
                : 'top-1/2 -translate-y-1/2 text-sm text-gray-500'
            }`}
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 flex items-center justify-center">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            min={min}
            max={max}
            step={step}
            className={`w-full rounded-lg border-2 px-3 py-2.5 font-medium transition-all duration-200 bg-white disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 ${
              icon ? 'pl-10' : ''
            } ${rightIcon ? 'pr-10' : ''} ${
              error
                ? 'border-red-500 focus:ring-2 focus:ring-red-200 focus:border-red-500'
                : 'border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
            } placeholder:text-gray-400`}
          />

          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 flex items-center justify-center pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
