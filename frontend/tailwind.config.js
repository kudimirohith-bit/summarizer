/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c2d3ff',
          300: '#93b0ff',
          400: '#6b8eff',
          500: '#4a6cf7',
          600: '#3451d8',
          700: '#2a3fb5',
          800: '#263593',
          900: '#1e2a70',
        },
        surface: {
          900: '#0d0f1a',
          800: '#131525',
          700: '#1a1d30',
          600: '#22253c',
          500: '#2d3050',
          400: '#3d4168',
        },
        verdict: {
          supported: '#10b981',
          weak: '#f59e0b',
          unsupported: '#ef4444',
        },
      },
      animation: {
        'pulse-warn': 'pulse-warn 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
      },
      keyframes: {
        'pulse-warn': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)' },
          '50%': { boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
