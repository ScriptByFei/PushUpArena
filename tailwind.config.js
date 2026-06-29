/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Markenfarben (Indigo/Violett) + dunkle Arena-Töne.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        ink: {
          950: '#0b1020',
          900: '#0f152a',
          800: '#161d36',
          700: '#1f2844',
          600: '#2b3556',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(99,102,241,0.35), 0 8px 30px rgba(79,70,229,0.25)',
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'xp-float': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.9)' },
          '25%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-22px)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(99,102,241,0.45)' },
          '100%': { boxShadow: '0 0 0 10px rgba(99,102,241,0)' },
        },
        glow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 5px rgba(129,140,248,0.65))' },
          '50%': { filter: 'drop-shadow(0 0 12px rgba(129,140,248,0.95))' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.2s ease-out',
        'xp-float': 'xp-float 1s ease-out forwards',
        'pulse-ring': 'pulse-ring 0.7s ease-out',
        glow: 'glow 2.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
