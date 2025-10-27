"use client"
import { useCart } from '../lib/cart'

export default function AddToCart({ slug, name, price, imageUrl }: { slug: string; name: string; price: number | null; imageUrl?: string }) {
  const { add } = useCart()
  return (
    <button className="btn-primary" onClick={() => add({ slug, name, price: price || 0, imageUrl })}>
      Добавить в корзину
    </button>
  )
}
