import { dir } from 'i18next'
import type { Metadata } from 'next'
import Providers from '../providers'
import Header from '../../components/Header'
import Footer from '../../components/Footer'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { lng: string } }): Promise<Metadata> {
  const title = 'Horecas Group — Премиальная посуда для HoReCa'
  const description = 'Магазин профессиональной посуды для ресторанов, кафе и отелей. Прямые поставки, быстрая доставка по Казахстану и цены в тенге (₸).'
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description
    }
  }
}

export default function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: { lng: string }
}) {
  const lng = params.lng || 'ru'
  return (
    <html lang={lng} dir={dir(lng)}>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
