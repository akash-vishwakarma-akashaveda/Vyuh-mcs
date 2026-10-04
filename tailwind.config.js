/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neutral: {
          900: 'var(--neutral-900)',
          800: 'var(--neutral-800)',
          700: 'var(--neutral-700)',
          600: 'var(--neutral-600)',
          500: 'var(--neutral-500)',
          400: 'var(--neutral-400)',
          300: 'var(--neutral-300)',
          200: 'var(--neutral-200)',
          50: 'var(--neutral-50)',
        },
        action: {
          primary: 'var(--action-primary)',
          hover: 'var(--action-hover)',
          active: 'var(--action-active)',
        },
        brand: {
          navy: 'var(--brand-navy)',
          blue: 'var(--brand-blue)',
        },
        status: {
          info: 'var(--info)',
          warning: 'var(--warning)',
          danger: 'var(--danger)',
          success: 'var(--success)',
        },
      },
      fontFamily: {
        mono: ['"Geist Mono"', 'monospace'],
        sans: ['"Geist"', 'sans-serif'],
        display: ['Geist', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
