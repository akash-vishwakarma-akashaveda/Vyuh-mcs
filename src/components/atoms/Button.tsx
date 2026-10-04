import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  /** Shown next to a disabled button, so a blocked action always says why. */
  reason?: string;
}

/**
 * Buttons. Primary is kesari, the one action on a screen that matters; everything
 * else is a quiet filled secondary. Rounded 10 px, heights 32 / 40 / 44.
 */
export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', isLoading = false, className, disabled, reason, ...props
}) => {
  const base =
    'relative inline-flex items-center justify-center font-medium rounded-[10px] select-none whitespace-nowrap ' +
    'disabled:pointer-events-none disabled:bg-[#141821] disabled:text-[#6B7383] disabled:border-[#1A1E27]';

  const variants: Record<string, string> = {
    primary: 'text-[#1A0E02] font-semibold bg-[#F28C28] hover:bg-[#F59A45] active:bg-[#C46F1C] border border-transparent',
    secondary: 'text-[#E9ECF1] bg-[#171B24] border border-[#232936] hover:bg-[#1D222D]',
    danger: 'text-[#FF7A7A] bg-[#171B24] border border-[#3A2328] hover:bg-[#21171A]',
    warning: 'text-[#1A1400] font-semibold bg-[#F5C451] hover:bg-[#F7CF6E] border border-transparent',
    ghost: 'text-[#9AA3B2] hover:text-[#E9ECF1] hover:bg-[#171B24] border border-transparent',
    outline: 'text-[#F2A65A] bg-transparent border border-[#F28C28]/60 hover:bg-[#F28C28]/10',
  };

  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-[12.5px] gap-1.5',
    md: 'h-10 px-4 text-[13.5px] gap-2',
    lg: 'h-11 px-5 text-[14px] gap-2',
  };

  const button = (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      title={disabled && reason ? reason : props.title}
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

  if (!disabled || !reason) return button;
  return (
    <span className="inline-flex items-center gap-2.5 flex-wrap">
      {button}
      <span className="text-[12.5px] text-[#9AA3B2] max-w-[42ch] leading-snug">{reason}</span>
    </span>
  );
};
