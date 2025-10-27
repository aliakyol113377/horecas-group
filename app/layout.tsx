import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Horecas Group — Премиальная посуда для HoReCa',
  description: 'Официальный магазин horecas group: профессиональная посуда для ресторанов, кафе и отелей. Прямые поставки от производителей, гарантии и лучшие цены в KZT.',
  icons: {
    icon: '/logo-horecas.png',
    shortcut: '/logo-horecas.png',
    apple: '/logo-horecas.png'
  }
}

export const viewport = {
  themeColor: '#ffffff'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* metadataBase for absolute OG URLs */}
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="/logo-horecas.png" />
        <link rel="apple-touch-icon" href="/logo-horecas.png" />
      </head>
      <body className={`${inter.className} min-h-screen`}>{children}</body>
    </html>
  )
}
