import CatalogClient from './ui'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Каталог — Horecas Group'
  const description = 'Профессиональная столовая посуда для ресторанов, кафе и отелей: тарелки, стаканы, бокалы, столовые приборы и аксессуары. Доставка по Казахстану.'
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

export default function CatalogPage() {
  return <CatalogClient />
}
