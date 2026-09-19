import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

/**
 * Buttons. Sizes are the SRS §7.5 heights (28 / 36 / 44). The primary fill is a
 * two-stop teal with a light top edge, so it reads as a raised object rather
 * than a coloured rectangle — and it presses in by half a pixel.
 */
export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', isLoading = false, className, disabled, ...props
}) => {
  const base =
    'relative inline-flex items-center justify-center font-semibold rounded-lg select-none whitespace-nowrap ' +
    'transition-[background,box-shadow,transform,color] duration-150 ease-out ' +
    'active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-45';

  const variants: Record<string, string> = {
    primary: 'text-white bg-[#0F6E56] hover:bg-[#3CB992] active:bg-[#0B5443] shadow-sm',
    secondary: 'text-[#D1D5DB] bg-[#14161B] border border-[#2B3140] hover:bg-[#1A1D24] shadow-sm',
    danger: 'text-white bg-[#C62828] hover:bg-[#B91C1C] shadow-sm',
    warning: 'text-white bg-[#E8943A] hover:bg-[#B45309] shadow-sm',
    ghost: 'text-[#8B92A0] hover:text-[#F3F4F6] hover:bg-[#1A1D24]',
    outline: 'text-[#3CB992] border border-[#0F6E56]/40 hover:bg-[#0F6E56]/10',
  };

  const sizes: Record<string, string> = {
    sm: 'h-7 px-2.5 text-[12px] gap-1.5',
    md: 'h-9 px-3.5 text-[13px] gap-2',
    lg: 'h-11 px-5 text-[14px] gap-2',
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};
