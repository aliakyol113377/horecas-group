# Final Report: Horecas Group Storefront

This document summarizes the finished state of the project, architecture decisions, key features, and how to operate and deploy the app.

## Summary

- Stack: Next.js 14 App Router, React 18, TypeScript, TailwindCSS
- i18n: Custom middleware with `[lng]` segment; Russian default
- Data layer: Prisma + Postgres (Supabase) with a robust file-DB fallback (`data/products.json`, `data/categories.json`)
- Importer: Advanced crawler/sitemap pipeline saving optimized images and rich product data (images[], specs)
- Catalog: Filters (search, category, subcategory, material, price, stock), sort, pagination, removable chips, lazy “Показать ещё”
- Product page: Gallery with thumbnails and modal, SKU/specs, price, breadcrumbs, similar products, JSON-LD, Add to Cart and Order Modal
- SEO: robots, sitemap; generateMetadata for product and catalog; default locale metadata; favicon via `app/icon.svg`

## Architecture

- App Router layout
  - `app/layout.tsx` — global styles and fonts
  - `app/[lng]/layout.tsx` — localized layout, Providers, Header/Footer, default metadata
  - `middleware.ts` — locale routing
- Components
  - `components/ProductGallery.tsx` (client): responsive gallery with modal lightbox
  - `components/AddToCart.tsx` (client): localStorage cart
  - `components/OrderModal.tsx` (client): phone-only lead capture to `/api/leads`
  - `components/FilterBar.tsx`, `components/SkeletonGrid.tsx`, `components/ProductCard.tsx`
- API
  - `/api/products` — paginated products with filters and sorting
  - `/api/facets` — categories, materials, brands, subcategoriesByCategory
  - `/api/leads` — lead capture; logs to `logs/leads.json` when DB unavailable
- Data access
  - DB-first with automatic file-DB fallback when DB is unreachable (controlled by `USE_FILE_DB`)

## Importer

- File: `prisma/import/import2.mjs`
- Modes: `crawl` or `sitemap`
- Outputs
  - `data/products.json` with: `slug`, `name`, `price`, `imageUrl`, `images[]`, `specs{}`, `categorySlug`, `subcategorySlug`
  - `data/categories.json` (hierarchical)
  - Optimized images in `public/imported/*.webp`
  - Detailed run logs in `logs/`
- Important env
  - `IMPORT_MODE` = `file` or `db`
  - `IMPORT_STRATEGY` = `crawl` or `sitemap`
  - `IMPORT_BASE_URL`, `IMPORT_SITEMAP_URL`, `IMPORT_IGNORE_ROBOTS`
  - `FILE_DB_DIR` (default `data`)

## Product page details

- Reads from DB when available; falls back to file-DB
- Extracts `sku` from DB attributes or `specs` in file-DB
- Renders detailed specs table
- JSON-LD Product schema with `offers` and `availability`
- Suggests similar products by subcategory or category

## SEO & Metadata

- `app/[lng]/layout.tsx` — default localized metadata (title, description, OG/Twitter)
- `app/[lng]/catalog/page.tsx` — catalog metadata
- `app/[lng]/product/[slug]/page.tsx` — product metadata from file-DB first; OG/Twitter images from product images
- `app/icon.svg` — favicon
- `app/robots.ts`, `app/sitemap.ts` — search engine primitives

## Running locally

- Install: `npm i`
- Dev: `npm run dev` and open http://localhost:3000/ru
- File-DB mode env (example):
  - `USE_FILE_DB=true`
  - `IMPORT_MODE=file`, `FILE_DB_DIR=data`

## Deploying (Vercel)

- Set env vars: `DATABASE_URL`, `NEXT_PUBLIC_*`, `IMPORT_*`, `USE_FILE_DB`
- Build command: `npm run build`
- If using file-DB: commit `data/products.json` (and `data/categories.json`) and set `USE_FILE_DB=true`
- Validate `/ru/catalog` and a product page; view OG tags and JSON-LD in page source

## Quality gates

- Build: PASS (Next.js 14 — compiled successfully)
- Lint/Typecheck: PASS (TypeScript OK). Note: DB reachability warnings during SSG are non-blocking when `USE_FILE_DB=true`.
- Tests: N/A (no test suite included)

## Next steps (optional)

- Run full importer to populate the file-DB or the real DB
- Add Lighthouse tuning (images sizes, preloads), and brand assets
- Hook up real order flow (checkout, payments) if desired

## Appendix: Key files

- `app/[lng]/product/[slug]/page.tsx` — product page with metadata and JSON-LD
- `app/[lng]/catalog/page.tsx` — catalog page + metadata
- `components/ProductGallery.tsx` — interactive gallery
- `prisma/import/import2.mjs` — importer pipeline
- `app/icon.svg` — favicon/icon
