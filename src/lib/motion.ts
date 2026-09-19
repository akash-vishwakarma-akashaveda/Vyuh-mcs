import type { Variants } from 'framer-motion';

/**
 * Shared motion. Chrome moves; data does not.
 *
 * A telemetry value must never ease into place — an operator reading a number
 * mid-tween is reading a number the spacecraft never sent (SRS §3.7). So the
 * whole motion budget goes to the frame around the data: panels arriving,
 * drawers opening, the nav marker tracking the active screen.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const page: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: EASE_OUT, staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

export const panel: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
};

export const drawer: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE_OUT } },
  exit: { opacity: 0, x: 16, transition: { duration: 0.14 } },
};

export const overlay: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.16 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

export const modal: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.99, y: 4, transition: { duration: 0.12 } },
};

/** The active-nav marker travels between items rather than blinking on. */
export const NAV_MARKER = { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 } as const;
