'use client';

import React from 'react';
import Image from 'next/image';

interface AvatarProps {
  name?: string;
  image?: string;
  size?: 'sm' | 'md' | 'lg';
  role?: 'doctor' | 'patient' | 'frontdesk';
  className?: string;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      name = 'Unknown',
      image,
      size = 'md',
      role,
      className = '',
    },
    ref
  ) => {
    const sizeStyles = {
      sm: 'w-8 h-8 text-xs',
      md: 'w-10 h-10 text-sm',
      lg: 'w-12 h-12 text-base',
    };

    const roleStyles = {
      doctor: 'bg-primary-100 text-primary-700',
      patient: 'bg-secondary-100 text-secondary-700',
      frontdesk: 'bg-primary-100 text-primary-700',
    };

    const defaultBg = 'bg-gray-200 text-gray-700';

    const getInitials = (fullName: string): string => {
      return fullName
        .split(' ')
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('');
    };

    const initials = getInitials(name);
    const bgColor = role ? roleStyles[role] : defaultBg;

    return (
      <div
        ref={ref}
        className={`rounded-full font-semibold flex items-center justify-center overflow-hidden flex-shrink-0 ${sizeStyles[size]} ${bgColor} ${className}`}
      >
        {image ? (
          <Image
            src={image}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          initials
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';
