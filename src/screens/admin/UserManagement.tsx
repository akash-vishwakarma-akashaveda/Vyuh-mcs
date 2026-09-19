import React, { useState } from 'react';
import { PEOPLE } from '../../store/useAuthStore';
import { Button } from '../../components/atoms/Button';
import { InputField } from '../../components/molecules/InputField';
import { UserPlus, CheckCircle2, X } from 'lucide-react';
import { formatUTC } from '../../utils/formatUTC';
import { UserRole, User } from '../../types';

interface UserManagementProps {
  onNavigate: (path: string) => void;
}

export const UserManagement: React.FC<UserManagementProps> = () => {
  const [users, setUsers] = useState(PEOPLE);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Mission Controller');
  const [newScope, setNewScope] = useState('AKV-01, AKV-02, AKV-03');
  const [successMsg, setSuccessMsg] = useState('');

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail) return;

    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: newName,
      email: newEmail,
      roles: [newRole],
      satellite_scope: newScope.split(',').map(s => s.trim()).filter(Boolean),
      mfa_enabled: true,
      last_login_utc: new Date().toISOString(),
      status: 'ACTIVE',
    };

    setUsers(prev => [newUser, ...prev]);
    setShowInviteModal(false);
    setNewName('');
    setNewEmail('');
    setSuccessMsg(`Invitation dispatched to ${newEmail} with hardware token activation instructions.`);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const toggleMFA = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, mfa_enabled: !u.mfa_enabled } : u));
  };

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto">
      <div className="flex justify-between  items-center rounded-xl border border-[#23272F] bg-gradient-to-r from-[#0F6E56]/20 via-[#161A20] to-[#14161B] px-5 py-4 border-l-4 border-l-[#3CB992]">
        <div className="flex flex-col">
          <h1 className="text-[22px] leading-[1.15] font-bold">Users & access</h1>
          <p className="text-[13px] text-[var(--color-text-secondary)]">Operator roles, satellite authorization scope & MFA enforcement</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowInviteModal(true)}>
          <UserPlus size={14} aria-hidden="true" /> Invite Operator
        </Button>
      </div>

      {successMsg && (
        <div className="bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border border-[var(--success)] p-3 rounded-lg flex items-center justify-between text-xs font-mono-code text-[var(--success)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-[var(--color-text-secondary)] hover:text-white"><X size={14} /></button>
        </div>
      )}

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-4 overflow-hidden">
        <table className="w-full text-left font-mono-code text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)] text-[10px]">
              <th className="py-2.5 px-3">OPERATOR</th>
              <th className="py-2.5 px-3">EMAIL</th>
              <th className="py-2.5 px-3">ASSIGNED ROLES</th>
              <th className="py-2.5 px-3">SCOPE</th>
              <th className="py-2.5 px-3">2FA STATUS</th>
              <th className="py-2.5 px-3">LAST LOGIN</th>
              <th className="py-2.5 px-3 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {users.map((usr) => (
              <tr key={usr.id} className="border-b border-[var(--color-bg-overlay)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                <td className="py-2.5 px-3 font-bold text-[var(--color-text-primary)]">{usr.name}</td>
                <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{usr.email}</td>
                <td className="py-2.5 px-3 text-[var(--action-primary)] font-bold">{usr.roles.join(', ')}</td>
                <td className="py-2.5 px-3 text-[var(--info)]">{usr.satellite_scope.join(', ')}</td>
                <td className="py-2.5 px-3">
                  <button 
                    onClick={() => toggleMFA(usr.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                      usr.mfa_enabled 
                        ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--success)_25%,transparent)]' 
                        : 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--warning)_25%,transparent)]'
                    }`}
                    title="Click to toggle MFA status"
                  >
                    {usr.mfa_enabled ? '✓ Enabled' : '✕ Disabled'}
                  </button>
                </td>
                <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{formatUTC(usr.last_login_utc, 'HH:mm:ss')}</td>
                <td className="py-2.5 px-3 text-right">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-[var(--danger-text)] hover:text-red-400 text-[11px]"
                    onClick={() => setUsers(prev => prev.filter(u => u.id !== usr.id))}
                  >
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Operator Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--color-bg-canvas)_80%,transparent)] backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleInvite} className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 rounded-md max-w-md w-full flex flex-col gap-4 font-mono-code">
            <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-3">
              <h2 className="text-[16px] font-bold text-[var(--color-text-primary)]">Invite Mission Operator</h2>
              <button type="button" onClick={() => setShowInviteModal(false)} className="text-[var(--color-text-secondary)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <InputField
              label="Full Name"
              placeholder="e.g. Dr. Vikram Sarabhai"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />

            <InputField
              label="Operator Email"
              type="email"
              placeholder="operator@vyuh-mcs.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[var(--color-text-secondary)] uppercase font-bold">Operational Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-3 py-2 text-xs text-[var(--color-text-primary)]"
              >
                <option>Mission Controller</option>
                <option>Flight Engineer</option>
                <option>Payload Engineer</option>
                <option>Mission Designer</option>
                <option>System Administrator</option>
              </select>
            </div>

            <InputField
              label="Authorized Satellite Scope"
              placeholder="AKV-01, AKV-02, AKV-03"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
              helperText="Comma-separated list of spacecraft IDs"
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowInviteModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Send Invitation
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
