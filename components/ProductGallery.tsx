"use client"
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  images: string[]
  name: string
}

export default function ProductGallery({ images, name }: Props) {
  const normalized = useMemo(() => (images || []).filter((x) => typeof x === 'string' && x.length > 0), [images])
  const [activeIndex, setActiveIndex] = useState(0)
  const [isModalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (activeIndex >= normalized.length) setActiveIndex(0)
  }, [activeIndex, normalized.length])

  if (!normalized.length) return null

  const active = normalized[activeIndex]

  return (
    <div className="flex flex-col gap-4">
      <button
        aria-label="Открыть галерею"
        className="group relative aspect-square overflow-hidden rounded-lg bg-black/10"
        onClick={() => setModalOpen(true)}
      >
        {active.startsWith('http') ? (
          <img src={active} alt={name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Image
            src={active}
            alt={name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(min-width: 768px) 50vw, 90vw"
          />
        )}
        <div className="pointer-events-none absolute inset-0 border border-white/10" />
      </button>

      {normalized.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {normalized.map((src, idx) => (
            <button
              key={src + idx}
              onClick={() => setActiveIndex(idx)}
              className={`relative aspect-square overflow-hidden rounded-md border transition ${idx === activeIndex ? 'border-brand-gold ring-2 ring-brand-gold/40' : 'border-transparent ring-1 ring-white/10 hover:ring-brand-gold/40'}`}
              aria-label={`Показать изображение ${idx + 1}`}
            >
              {src.startsWith('http') ? (
                <img src={src} alt={`${name} ${idx + 1}`} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <Image src={src} alt={`${name} ${idx + 1}`} fill className="object-cover" sizes="80px" />
              )}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.button
              className="absolute right-6 top-6 text-white/90 transition hover:text-white"
              onClick={() => setModalOpen(false)}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              Закрыть ✕
            </motion.button>
            <motion.div
              className="relative w-full max-w-4xl overflow-hidden rounded-xl bg-black/40"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
            >
              {active.startsWith('http') ? (
                <img src={active} alt={`${name} крупный план`} loading="lazy" className="w-full h-full object-contain" />
              ) : (
                <Image
                  src={active}
                  alt={`${name} крупный план`}
                  fill
                  className="object-contain"
                  sizes="(min-width: 1024px) 1024px, 90vw"
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
