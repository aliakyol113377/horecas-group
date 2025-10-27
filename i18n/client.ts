import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from '../public/locales/ru/common.json' assert { type: 'json' }
import kk from '../public/locales/kk/common.json' assert { type: 'json' }

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        ru: { translation: ru },
        kk: { translation: kk }
      },
      lng: 'ru',
      fallbackLng: 'ru',
      interpolation: { escapeValue: false }
    })
}

export default i18n
