/*************************************************
 * next-i18next configuration
 *************************************************/
export default {
  i18n: {
    defaultLocale: 'ru',
    locales: ['ru', 'kk']
  },
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  localePath: './public/locales'
}
