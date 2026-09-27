import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../components/atoms/Button';
import { Card } from '../components/molecules/Page';
import { ScreenSpec } from '../data/screens';
import { UserRole } from '../types';

/**
 * Shown when a deep link points at a screen this role may not open. The product
 * refuses at the API too — this page is the courtesy, not the control (NFR-06).
 */
export const NotAuthorized: React.FC<{ screen: ScreenSpec; role: UserRole; onNavigate: (to: string) => void }> = ({
  screen, role, onNavigate,
}) => (
  <div className="max-w-[640px]">
    <Card>
      <div className="flex flex-col items-start gap-4 py-4">
        <span className="w-11 h-11 rounded-full border border-[#D42C2C]/60 bg-[#D42C2C]/12 flex items-center justify-center">
          <ShieldAlert size={22} className="text-[#FF3838]" />
        </span>

        <div className="flex flex-col gap-1.5">
          <h1 className="text-[20px] font-bold">Not available to {role}</h1>
          <p className="text-[13.5px] leading-[1.6] text-[#A3B1C2]">
            <span className="font-mono-code text-[12.5px] text-[#4DACFF]">{screen.id} {screen.name}</span> is for{' '}
            {screen.roles.join(', ')}. Your session holds one active role, so switch role from the user
            menu — or ask someone who holds it.
          </p>
        </div>

        <p className="text-[12.5px] text-[#5F7087] leading-[1.55]">
          The request was refused, not hidden: the API returns the same answer, so nothing about the
          data behind this screen is revealed by asking for it.
        </p>

        <div className="flex gap-2 pt-1">
          <Button onClick={() => onNavigate('fleet')}>Back to fleet overview</Button>
          <Button variant="secondary" onClick={() => onNavigate('scope')}>Change role</Button>
        </div>
      </div>
    </Card>
  </div>
);
