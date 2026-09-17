import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
      },
      boxShadow: { soft: '0 18px 50px rgba(21, 42, 43, .08)' },
      borderRadius: { '2xl': '1.35rem', '3xl': '1.8rem' },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
