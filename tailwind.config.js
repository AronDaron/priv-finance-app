/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'finance-green': '#10b981',
        'finance-red': '#ef4444',
        'finance-dark': '#111827',
        'finance-card': '#1f2937',
      }
    },
  },
  plugins: [],
}
