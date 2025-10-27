"use client"

import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n/client'
import { CartProvider } from '../lib/cart'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <CartProvider>{children}</CartProvider>
    </I18nextProvider>
  )
}
