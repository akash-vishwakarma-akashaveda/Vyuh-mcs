import { useEffect } from 'react';

/**
 * Replaces every browser tooltip with the console's own. Any element with a `title`
 * attribute keeps working as written: on hover or keyboard focus the title moves to
 * `data-tip` (so the browser never shows its yellow box) and a styled tip appears.
 * Mount once, near the root.
 */
export function TooltipHost(): null {
  useEffect(() => {
    const tip = document.createElement('div');
    tip.className = 'vyuh-tip';
    tip.setAttribute('role', 'tooltip');
    tip.style.display = 'none';
    document.body.appendChild(tip);
    let timer = 0;
    let target: HTMLElement | null = null;

    const adopt = (el: HTMLElement) => {
      const t = el.getAttribute('title');
      if (t) { el.setAttribute('data-tip', t); el.removeAttribute('title'); if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', t); }
      return el.getAttribute('data-tip');
    };
    const hide = () => { window.clearTimeout(timer); tip.style.display = 'none'; target = null; };
    const show = (el: HTMLElement) => {
      const text = el.getAttribute('data-tip');
      if (!text || !el.isConnected) return;
      tip.textContent = text;
      tip.style.display = 'block';
      const r = el.getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const below = r.bottom + 8 + h < window.innerHeight;
      tip.style.left = `${left}px`;
      tip.style.top = `${below ? r.bottom + 8 : r.top - h - 8}px`;
    };
    const enter = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[title],[data-tip]') as HTMLElement | null;
      if (!el || el === target) return;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') { /* svg <title> children are fine */ }
      hide();
      if (!adopt(el)) return;
      target = el;
      timer = window.setTimeout(() => show(el), e.type === 'focusin' ? 0 : 350);
    };
    const leave = (e: Event) => {
      if (!target) return;
      const to = (e as MouseEvent).relatedTarget as Node | null;
      if (to && target.contains(to)) return;
      hide();
    };

    document.addEventListener('mouseover', enter, true);
    document.addEventListener('focusin', enter, true);
    document.addEventListener('mouseout', leave, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', enter, true);
      document.removeEventListener('focusin', enter, true);
      document.removeEventListener('mouseout', leave, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      tip.remove();
    };
  }, []);
  return null;
}
