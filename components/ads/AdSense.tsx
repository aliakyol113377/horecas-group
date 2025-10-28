"use client"
import Script from 'next/script'
import { useEffect } from 'react'

declare global {
  interface Window {
    adsbygoogle?: any[]
  }
}

type AdSenseProps = {
  slot: string
  style?: React.CSSProperties
  format?: string
  responsive?: boolean
}

export default function AdSense({ slot, style, format = 'auto', responsive = true }: AdSenseProps) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
  if (!client || !slot) {
    // Not configured in env — render nothing
    return null
  }

  useEffect(() => {
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {}
  }, [slot])

  return (
    <>
      <Script
        id="adsense-lib"
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`}
        crossOrigin="anonymous"
      />
      <ins
        className="adsbygoogle"
        style={style || { display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </>
  )
}
