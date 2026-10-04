import React from 'react';
import { clsx } from 'clsx';
import { canOpenRoute, whoCanOpen } from '../../auth/policy';
import { useAuthStore } from '../../store/useAuthStore';

/** A link that exists only for a role that can open the target; otherwise it says who handles it (rule 2). */
export const RoleLink: React.FC<{ to: string; onNavigate: (to: string) => void; children: React.ReactNode; className?: string; arrow?: boolean }> = ({
  to, onNavigate, children, className, arrow = true,
}) => {
  const role = useAuthStore((s) => s.activeRole);
  if (!canOpenRoute(to, role)) {
    return <span className={clsx('text-[12px] text-[#7C8594]', className)}>Handled by {whoCanOpen(to)}</span>;
  }
  return (
    <button type="button" onClick={() => onNavigate(to)}
      className={clsx('text-left text-[12.5px] text-[#F2A65A] hover:text-[#FFC48A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F28C28] rounded', className)}>
      {children}{arrow && ' →'}
    </button>
  );
};

/** True when the signed-in role can open the route (for rows and cards that navigate on click). */
export const useCanOpen = () => {
  const role = useAuthStore((s) => s.activeRole);
  return (to: string) => canOpenRoute(to, role);
};
