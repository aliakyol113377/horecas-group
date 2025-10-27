"use client"
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

export default function Header() {
  const pathname = usePathname()
  const lng = pathname?.split('/').filter(Boolean)[0] || 'ru'
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
      <div className="container h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href={`/${lng}`} className="flex items-center gap-2">
          <span className="relative block h-8 w-auto">
            <Image src="/logo-horecas.png" alt="Horecas Group" width={120} height={32} priority className="h-8 w-auto" />
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href={`/${lng}`} className="hover:text-amber-600 transition">Главная</Link>
          <Link href={`/${lng}/catalog`} className="hover:text-amber-600 transition">Каталог</Link>
          <Link href={`/${lng}/about`} className="hover:text-amber-600 transition">О компании</Link>
          <Link href={`/${lng}/contacts`} className="hover:text-amber-600 transition">Контакты</Link>
          <Link href={`/${lng}/cart`} className="hover:text-amber-600 transition">Корзина</Link>
        </nav>
        <div className="flex items-center gap-3">
          <a href="tel:+77763118110" className="text-sm font-semibold text-gray-900 hover:text-amber-700 transition">+7 776 311 8110</a>
        </div>
      </div>
    </header>
  )
}
