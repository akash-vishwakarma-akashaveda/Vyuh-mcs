import React from 'react';
import { clsx } from 'clsx';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  unitSuffix?: string;
  helperText?: string;
}

export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, unitSuffix, helperText, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            id={inputId}
            ref={ref}
            className={clsx(
              'w-full bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm font-mono-code transition-colors duration-180 placeholder:text-[var(--color-text-disabled)]',
              'focus:outline-none focus:border-[var(--info)] focus:ring-1 focus:ring-[var(--info)]',
              'disabled:bg-[var(--color-bg-surface)] disabled:text-[var(--color-text-disabled)] disabled:cursor-not-allowed',
              error && 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]',
              unitSuffix && 'pr-12',
              className
            )}
            {...props}
          />
          {unitSuffix && (
            <span className="absolute right-3 text-xs font-mono-code text-[var(--color-text-secondary)] pointer-events-none">
              {unitSuffix}
            </span>
          )}
        </div>
        {error ? (
          <span className="text-xs text-[var(--danger-text)] font-mono-code">{error}</span>
        ) : helperText ? (
          <span className="text-xs text-[var(--color-text-secondary)]">{helperText}</span>
        ) : null}
      </div>
    );
  }
);
