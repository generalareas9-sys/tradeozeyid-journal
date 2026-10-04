/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // The approved design tokens from docs/phase-plan.md, Phase 2, "Design
      // token system" (ADR-014). Single source of truth: the values live as CSS
      // custom properties in src/styles/index.css and are referenced here,
      // never duplicated.
      //
      // These are bare `var()` references, so Tailwind colour-alpha modifiers
      // (`bg-accent/10`) must never be used on them: Tailwind 3.4 discards the
      // alpha and emits no rule at all. Every tint is an explicit `*-soft` token.
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'accent-strong': 'var(--color-accent-strong)',
        'accent-soft': 'var(--color-accent-soft)',
        positive: 'var(--color-positive)',
        'positive-soft': 'var(--color-positive-soft)',
        negative: 'var(--color-negative)',
        'negative-soft': 'var(--color-negative-soft)',
      },
      // Focus rings default to the brand accent, so `focus-visible:ring-2` is
      // purple without every call site having to name it.
      ringColor: {
        DEFAULT: 'var(--color-accent)',
      },
      boxShadow: {
        // Restrained, tinted with the text colour rather than pure black.
        card: 'var(--shadow-card)',
      },
      // Tailwind's default spacing, radius and z-index scales are intentionally
      // left untouched.
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};