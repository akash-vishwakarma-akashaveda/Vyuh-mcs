import React, { useState } from 'react';
import { Button } from '../../components/atoms/Button';
import { InputField } from '../../components/molecules/InputField';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

interface ContactDemoProps {
  onNavigate: (path: string) => void;
}

export const ContactDemo: React.FC<ContactDemoProps> = ({ onNavigate }) => {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] p-6 max-w-xl mx-auto flex flex-col justify-center gap-6">
      <Button variant="ghost" size="sm" onClick={() => onNavigate('/')} className="self-start">
        <ArrowLeft size={16} /> Back to Home
      </Button>

      <div className="flex flex-col gap-2">
        <h1 className="font-display-title text-2xl font-bold">Request a Mission Control Demo</h1>
        <p className="text-xs text-[var(--color-text-secondary)]">Schedule a live walkthrough of VYUH-MCS with our satellite operations engineering team.</p>
      </div>

      {submitted ? (
        <div className="bg-[color-mix(in_srgb,var(--action-primary)_15%,transparent)] border border-[var(--action-primary)] p-6 rounded-xl flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={40} className="text-[var(--success)]" />
          <h2 className="font-display-title font-bold text-lg">Request Received</h2>
          <p className="text-xs text-[var(--color-text-secondary)]">We'll reach out within one business day to coordinate secure deployment access.</p>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('/constellation')}>
            Go to Console Demo
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-6 rounded-xl flex flex-col gap-4"
        >
          <InputField label="Full Name" placeholder="e.g. Dr. Vikram Sarabhai" required />
          <InputField label="Organisation / Agency" placeholder="e.g. ISRO / Commercial Operator" required />
          <InputField label="Work Email" type="email" placeholder="name@organisation.com" required />
          
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Constellation Size
            </label>
            <select className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm font-mono-code text-[var(--color-text-primary)]">
              <option>1 – 10 Spacecraft</option>
              <option>10 – 50 Spacecraft</option>
              <option>50 – 500 Spacecraft (Full Fleet)</option>
            </select>
          </div>

          <Button type="submit" variant="primary" size="lg" className="mt-2">
            Submit Request
          </Button>
        </form>
      )}
    </div>
  );
};
