# Деплой Horecas Group на Vercel

## Переменные окружения
- DATABASE_URL (Supabase, c sslmode=require)
- NEXT_PUBLIC_DEFAULT_LOCALE=ru
- NEXT_PUBLIC_PHONE_DISPLAY="+7 776 311 8110"
- SUPPLIER_URL=https://complex-bar.kz/catalog/stolovaya-posuda/
- IMPORT_URL_PREFIX=/catalog/stolovaya-posuda/
- IMPORT_BATCH=100
- IMPORT_CONCURRENCY=5
- IMPORT_IGNORE_ROBOTS=false

## Шаги деплоя
1. Подключите репозиторий к Vercel
2. Добавьте переменные окружения (см. выше)
3. Запустите сборку: Build Command `npm run build`, Output `.next`
4. Примените схему БД (один из вариантов):
   - Через Supabase SQL Editor: выполнить `prisma/schema.sql`
   - Или временно запустить `npx prisma db push` в отдельном Runner после снятия сетевых ограничений
5. (Опционально) Импорт каталога:
   - Запуск локально: `npm run import:run`
   - Либо GitHub Actions/One-off Job с теми же env
6. Подключите домен и включите HTTPS

## Трюки производительности
- next/image + webp (sharp) уже на стороне импортёра
- Включите HTTP/2 и сжатие на CDN (активация по умолчанию на Vercel)
- Следите за CWV (LCP/CLS) и оптимизируйте крупные шрифты/баннеры
