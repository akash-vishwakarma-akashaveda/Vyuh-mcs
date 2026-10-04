import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/atoms/Button';
import { Logo } from '../../components/atoms/Logo';
import { FACTS } from '../../data/facts';
import { Select } from '../../components/molecules/Select';

const KEY = 'vyuh.contactRequests';
const SIZES = ['1 to 10 spacecraft', '10 to 50 spacecraft', '50 to 500 spacecraft'];
const inputCls = 'h-10 rounded-[10px] bg-[#0D1016] border border-[#232936] px-3 text-[14px] text-[#E9ECF1] outline-none focus:border-[#F28C28]';
type Form = { name: string; org: string; email: string; size: string; note: string };

/** Briefing request. There is no sales backend in this demo, so the request is kept in this browser and the page says so. */
export const ContactDemo: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const [f, setF] = useState<Form>({ name: '', org: '', email: '', size: SIZES[0], note: '' });
  const [errs, setErrs] = useState<Partial<Record<keyof Form, string>>>({});
  const [saved, setSaved] = useState<{ id: string; stored: boolean } | null>(null);
  const field = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: typeof errs = {};
    if (f.name.trim().length < 2) er.name = 'Enter your name.';
    if (f.org.trim().length < 2) er.org = 'Enter your organisation.';
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.trim())) er.email = 'Enter a valid work email.';
    if (f.note.length > 1000) er.note = 'Keep the note under 1000 characters.';
    setErrs(er);
    if (Object.keys(er).length) return;
    const id = `REQ-${Date.now().toString(36).toUpperCase()}`;
    let stored = true;
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      localStorage.setItem(KEY, JSON.stringify([...all, { id, ...f, at: new Date().toISOString() }]));
    } catch { stored = false; }
    setSaved({ id, stored });
  };

  const err = (k: keyof Form) => errs[k] && <span className="text-[12.5px] text-[#FF7A7A]">{errs[k]}</span>;

  return (
    <div className="min-h-screen bg-[#090B10] text-[#E9ECF1] px-4 py-8 flex justify-center">
      <div className="w-full max-w-[560px] flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('landing')}><ArrowLeft size={16} /> Back</Button>
          <Logo size={20} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em]">Request a briefing</h1>
          <p className="text-[14px] text-[#9AA3B2] leading-[1.6]">A walkthrough of the console and the ground segment behind it ({FACTS.liveSatellites} satellites on the live backend, {FACTS.demoFleet} in the console demo fleet).</p>
        </div>

        {saved ? (
          <section className="bg-[#11141B] border border-[#1A1E27] rounded-2xl p-6 flex flex-col gap-3">
            <h2 className="text-[17px] font-semibold">Request saved</h2>
            <p className="text-[13.5px] text-[#C9CED6] leading-[1.6]">
              {saved.stored
                ? <>Reference <span className="font-mono-code">{saved.id}</span>. This demo has no sales inbox: the request is stored in this browser only and has not been sent to anyone. To reach the team, email <a className="text-[#F2A65A] hover:text-[#FFC48A]" href={`mailto:contact@akashaveda.com?subject=${encodeURIComponent(`Briefing request ${saved.id}`)}&body=${encodeURIComponent(`${f.name}, ${f.org}\n${f.email}\n${f.size}\n\n${f.note}`)}`}>contact@akashaveda.com</a>.</>
                : <>This browser blocks local storage, so nothing was saved and nothing was sent. Please email contact@akashaveda.com.</>}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" onClick={() => onNavigate('landing')}>Back to the home page</Button>
              <Button variant="ghost" onClick={() => { setSaved(null); setF({ name: '', org: '', email: '', size: SIZES[0], note: '' }); }}>New request</Button>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} noValidate className="bg-[#11141B] border border-[#1A1E27] rounded-2xl p-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Name<input value={f.name} onChange={field('name')} autoComplete="name" className={inputCls} aria-invalid={!!errs.name} />{err('name')}</label>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Organisation<input value={f.org} onChange={field('org')} autoComplete="organization" className={inputCls} aria-invalid={!!errs.org} />{err('org')}</label>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Work email<input type="email" value={f.email} onChange={field('email')} autoComplete="email" placeholder="name@organisation.com" className={inputCls} aria-invalid={!!errs.email} />{err('email')}</label>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">Constellation size<Select value={f.size} onChange={(e) => setF((x) => ({ ...x, size: e.target.value }))} className={inputCls}>{SIZES.map((s) => <option key={s}>{s}</option>)}</Select></label>
            <label className="flex flex-col gap-1.5 text-[13px] text-[#9AA3B2]">What would you like to see? (optional)<textarea value={f.note} onChange={field('note')} rows={3} className={`${inputCls} h-auto py-2`} />{err('note')}</label>
            <p className="text-[12.5px] text-[#7C8594]">Saved in this browser only; this demo does not send the form anywhere.</p>
            <Button type="submit" size="lg">Save request</Button>
          </form>
        )}
      </div>
    </div>
  );
};
