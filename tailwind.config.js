/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        shake: {
          '10%': { transform: 'rotate(15deg)' },
          '20%': { transform: 'rotate(-15deg)' },
        },
      },
      animation: {
        shake: 'shake 0.25s',
      },
    },
  },
  plugins: [],
};
