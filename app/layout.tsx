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
        {/* Search engine verification metas (set in Vercel env) */}
        {process.env.NEXT_PUBLIC_YANDEX_VERIFICATION ? (
          <meta name="yandex-verification" content={process.env.NEXT_PUBLIC_YANDEX_VERIFICATION} />
        ) : null}
        {process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION ? (
          <meta name="google-site-verification" content={process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION} />
        ) : null}
        {/* Google AdSense global script (must be in <head> for verification). */}
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-8606447842195048')}`}
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${inter.className} min-h-screen`}>{children}</body>
      {/* Basic Organization JSON-LD to help brand queries */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Horecas Group',
            url: process.env.NEXT_PUBLIC_SITE_URL || 'https://horecasgroup.site',
            logo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://horecasgroup.site'}/logo-horecas.png`,
            contactPoint: [{
              '@type': 'ContactPoint',
              contactType: 'customer support',
              email: 'horecasgroup@gmail.com'
            }]
          })
        }}
      />
    </html>
  )
}
