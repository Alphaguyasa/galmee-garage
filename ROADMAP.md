# ROADMAP: Galmee Garage

Build order: M-next first, then M-after, then the remaining open items below.

## M-next: Tier 1 close-out

- [x] Job invoice/receipt layout (parts and labour lines, 80 mm)
- [x] Print and reprint from the job card
- [x] "Ready" SMS to the customer when the job status becomes ready (queued with the amount due; sent once the SMS sender is live)

## M-after: Tier 2 and 3

- [x] Reports screen (labour vs parts revenue, today / this Ethiopian month) with CSV
- [ ] Offline queue for job payments
- [ ] Parts stock on the shared items and stock (receive, deduct when a part is added to a job)
- [ ] Reorder-level low-stock list
- [ ] Staff invite and per-mechanic labour report
- [ ] Service-due reminders (by km or months) queued as SMS
- [ ] Export all tenant data to Excel

Not planned for now: vehicle photos, and a separate quotes module (a "quoted" job status covers estimates). The demo data loader is finished.

## M0: Foundation (shared pattern for all Galmee products)

- [x] Next.js App Router + TS + Tailwind + shadcn/ui scaffold; `npm run build` passes
- [x] PWA manifest, icons, offline shell; installs from Android Chrome
- [x] Supabase client (`@supabase/ssr`) with `.env.example` values; middleware session refresh
- [x] Auth: sign up, log in, log out; after first signup call `create_tenant` (vertical `garage`)
- [x] next-intl with `am`, `om`, `en`; language switcher; Ethiopic-friendly font (Noto Sans Ethiopic)
- [x] Ethiopian calendar date display helper + tests
- [x] App shell: bottom navigation on mobile, sidebar on desktop, tenant name and logo
- [ ] Staff management (owner only): invite staff, set role
- [x] Generated Supabase TypeScript types committed

## M1: Core screens

- [x] Customers: list, search by name/phone, detail with balance
- [x] Items and stock (if this product uses stock): list, add, receive stock
- [x] Payments and credit: record payment, credit statement
- [x] Reports: today / this week / this Ethiopian month; export CSV
- [ ] Offline queue for the main money action with sync status indicator

## M2: Galmee Garage features

- [x] Job card (vehicle, plate, complaint, mechanic, parts, labour)
- [x] Vehicle history by plate
- [x] Parts stock and sales
- [x] Mechanic work list
- [x] Unpaid jobs
- [x] Migration: gr_vehicles
- [x] Migration: gr_mechanics
- [x] Migration: gr_job_cards
- [x] Migration: gr_job_parts
- [x] Migration: gr_job_labour
- [x] Parts used on a job leave stock (reuse core stock tables / `record_sale` pattern)
- [x] Job total = parts + labour; unpaid balance to core `credit_ledger`

## M3: Notifications

- [x] SMS to customer when the car is ready, with amount due
- [ ] Edge Function reads `notifications` queue and sends (needs AfroMessage/Telegram keys: ask in the decision log)

## M4: Demo ready

- [ ] Demo tenant "Galmee Garage Demo" (seed function `gr_load_demo_data` ready and tested; the tenant itself is created with the demo login) with data: 40 vehicles with Ethiopian plate formats, 80 parts, 2 months of job cards
- [ ] Demo login documented in the decision log for Alpha (password set by Alpha, never committed)
- [ ] 5-minute demo path works on a phone in airplane mode for the main action
- [ ] Amharic and Afaan Oromo text reviewed list in the decision log for Alpha (native speaker)

## M5: Client ready

- [ ] Receipt printing (58/80 mm thermal) and Telegram receipt (80 mm job invoice done; Telegram copy open)
- [ ] Data import from Excel/CSV
- [ ] Export all tenant data to Excel
- [ ] Error monitoring hook (Sentry, DSN via env)
- [x] README: setup, env vars, deploy steps

## Q: Quality and security baseline (do these inside M0 and M1, not after)

- [x] `docs/DESIGN.md` written per the frontend guidelines (palette, type with Ethiopic support, layout wireframes, reviewed against generic defaults)
- [x] Tailwind theme tokens and `next/font` fonts from DESIGN.md
- [x] `server-only` Data Access Layer in `src/server/dal/`; every Server Action validates with zod and re-checks auth + role
- [x] Security headers and CSP with nonce (the security guidelines section 5)
- [x] Cross-tenant RLS test extended to this product's tables and passing
- [x] Playwright screenshot script for 360 px and 1280 px
- [x] `npm audit` clean, Dependabot active
- [ ] Self-audit (the security guidelines section 9) recorded in the dev log
