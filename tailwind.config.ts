import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: '#c9a227',
          dark: '#0b0b0c'
        }
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Inter', 'Arial']
      },
      backgroundImage: {
        'soft-gradient': 'linear-gradient(135deg, #0f1115 0%, #1a1f29 35%, #0f1115 100%)'
      }
    }
  },
  plugins: []
} satisfies Config
