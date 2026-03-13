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
        'finance-dark-2': '#0d1117',
      },
      backgroundImage: {
        'app-gradient': 'linear-gradient(135deg, #0d1117 0%, #111827 50%, #0f1f1a 100%)',
      }
    },
  },
  plugins: [],
}
