import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

/**
 * Buttons. Sizes are the SRS §7.5 heights (28 / 36 / 44). Flat, square-cornered.
 * Primary is kesari, the brand colour: one per screen, for the action that matters.
 */
export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', isLoading = false, className, disabled, ...props
}) => {
  const base =
    'relative inline-flex items-center justify-center font-medium rounded-[3px] select-none whitespace-nowrap ' +
    'transition-[background,box-shadow,transform,color] duration-150 ease-out ' +
    'active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-45';

  const variants: Record<string, string> = {
    primary: 'text-white bg-[#B8570C] hover:bg-[#D9731A] active:bg-[#9A480A]',
    secondary: 'text-[#C9D4E0] bg-[#111A25] border border-[#2C3E55] hover:bg-[#172434]',
    danger: 'text-white bg-[#D42C2C] hover:bg-[#B91C1C]',
    warning: 'text-white bg-[#FCE83A] hover:bg-[#B45309]',
    ghost: 'text-[#8496AB] hover:text-[#E6EDF3] hover:bg-[#172434]',
    outline: 'text-[#4DACFF] border border-[#2E6FD8]/40 hover:bg-[#2E6FD8]/10',
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
