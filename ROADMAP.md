# ROADMAP: Galmee Garage

## M0: Foundation (shared pattern for all Galmee products)

- [ ] Next.js App Router + TS + Tailwind + shadcn/ui scaffold; `npm run build` passes
- [ ] PWA manifest, icons, offline shell; installs from Android Chrome
- [ ] Supabase client (`@supabase/ssr`) with `.env.example` values; middleware session refresh
- [ ] Auth: sign up, log in, log out; after first signup call `create_tenant` (vertical `garage`)
- [ ] next-intl with `am`, `om`, `en`; language switcher; Ethiopic-friendly font (Noto Sans Ethiopic)
- [ ] Ethiopian calendar date display helper + tests
- [ ] App shell: bottom navigation on mobile, sidebar on desktop, tenant name and logo
- [ ] Staff management (owner only): invite staff, set role
- [ ] Generated Supabase TypeScript types committed

## M1: Core screens

- [ ] Customers: list, search by name/phone, detail with balance
- [ ] Items and stock (if this product uses stock): list, add, receive stock
- [ ] Payments and credit: record payment, credit statement
- [ ] Reports: today / this week / this Ethiopian month; export CSV
- [ ] Offline queue for the main money action with sync status indicator

## M2: Galmee Garage features

- [ ] Job card (vehicle, plate, complaint, mechanic, parts, labour)
- [ ] Vehicle history by plate
- [ ] Parts stock and sales
- [ ] Mechanic work list
- [ ] Unpaid jobs
- [ ] Migration: gr_vehicles
- [ ] Migration: gr_mechanics
- [ ] Migration: gr_job_cards
- [ ] Migration: gr_job_parts
- [ ] Migration: gr_job_labour
- [ ] Parts used on a job leave stock (reuse core stock tables / `record_sale` pattern)
- [ ] Job total = parts + labour; unpaid balance to core `credit_ledger`

## M3: Notifications

- [ ] SMS to customer when the car is ready, with amount due
- [ ] Edge Function reads `notifications` queue and sends (needs AfroMessage/Telegram keys: ask in NEEDS_APPROVAL.md)

## M4: Demo ready

- [ ] Demo tenant "Galmee Garage Demo" with data: 40 vehicles with Ethiopian plate formats, 80 parts, 2 months of job cards
- [ ] Demo login documented in NEEDS_APPROVAL.md for Alpha (password set by Alpha, never committed)
- [ ] 5-minute demo path works on a phone in airplane mode for the main action
- [ ] Amharic and Afaan Oromo text reviewed list in NEEDS_APPROVAL.md for Alpha (native speaker)

## M5: Client ready

- [ ] Receipt printing (58/80 mm thermal) and Telegram receipt
- [ ] Data import from Excel/CSV
- [ ] Export all tenant data to Excel
- [ ] Error monitoring hook (Sentry, DSN via env)
- [ ] README: setup, env vars, deploy steps

## Q: Quality and security baseline (do these inside M0 and M1, not after)

- [ ] `docs/DESIGN.md` written per `docs/FRONTEND.md` and the `frontend-design` skill (palette, type with Ethiopic support, layout wireframes, reviewed against generic defaults)
- [ ] Tailwind theme tokens and `next/font` fonts from DESIGN.md
- [ ] `server-only` Data Access Layer in `src/server/dal/`; every Server Action validates with zod and re-checks auth + role
- [ ] Security headers and CSP with nonce (SECURITY.md section 5)
- [ ] Cross-tenant RLS test extended to this product's tables and passing
- [ ] Playwright screenshot script for 360 px and 1280 px (`webapp-testing` skill)
- [ ] `npm audit` clean, Dependabot active
- [ ] Self-audit (SECURITY.md section 9) recorded in DAILY_LOG.md
