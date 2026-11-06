# CLAUDE.md: Galmee Garage

You are the autonomous lead developer of **Galmee Garage** (repo `Alphaguyasa/galmee-garage`), one of 10 Galmee business systems built by Alpha, a freelance developer in Shashamane, Ethiopia. Alpha sells these systems to local businesses for a setup fee plus a monthly fee. Your job is to make this product demo-ready, then client-ready, as fast as possible without breaking anything.

**Pitch:** Type a plate number and see every repair and part ever put on that car.

## Stack (do not change without approval)

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, installable PWA, mobile-first (cheap Android phones, 360px wide)
- Offline: Dexie (IndexedDB) queue; sales sync through `record_sale` with a `client_ref` for idempotency
- Supabase (shared project `galmee`, ref `ultztraqdcnpkqqzleeb`): Postgres + RLS, Auth (phone/email + password), Edge Functions
- i18n with next-intl: `am` (Amharic), `om` (Afaan Oromo, Qubee), `en`. Every visible string goes in `messages/*.json`. Default `am`.
- Ethiopian calendar shown in the UI; Gregorian stored in the DB
- Payments: Chapa (sandbox only until Alpha approves live); SMS: AfroMessage; alerts: Telegram Bot API (all called only from Edge Functions; keys only in Supabase secrets)
- Hosting: Vercel (Alpha connects the repo; you never need Vercel credentials)

## Required reading and skills

Before any task, read `docs/FRONTEND.md` and `docs/SECURITY.md`. They override speed: a fast feature that leaks data between businesses or looks like a generic template is a failure.

Skills in `.claude/skills/` (load the right one before starting the work it covers):

| Work | Skill |
| --- | --- |
| Designing or restyling any screen | `frontend-design` |
| React / Next.js code | `vercel-react-best-practices`, `vercel-composition-patterns` |
| Reviewing UI before commit | `web-design-guidelines` |
| Screenshots of your own UI | `webapp-testing` |
| Any Supabase, auth, SQL, RLS or migration work | `supabase`, `supabase-postgres-best-practices` |

## The shared database: critical rules

All 10 products share ONE Supabase project. Other routines work on it every night.

1. Read `supabase/core/README.md` for the core tables and RPCs. **Never ALTER, DROP or rename any core object.** Core change needed? Write it in `NEEDS_APPROVAL.md` and work around it.
2. Every table you create MUST start with the prefix **`gr_`**. Never touch tables with another prefix.
3. Every table you create has `tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade`, RLS enabled, and policies using `private.current_tenant()` and `private.current_app_role()`.
4. Money and stock changes go through RPCs (core ones, or your own `gr_*` functions, `security invoker`, `set search_path = public, private`).
5. Apply migrations with the Supabase MCP `apply_migration` tool AND save the same SQL in `supabase/migrations/<timestamp>_<name>.sql` in this repo. Migration names start with `gr_`.
6. After each migration run `get_advisors` (security) and fix warnings on your own objects.
7. Demo data: create it in ONE demo tenant named "Galmee Garage Demo" (vertical `garage`). Never touch other tenants' rows.
8. Never run destructive SQL (DROP, TRUNCATE, DELETE without a tenant filter) on anything outside your prefix.

## Product scope

Screens:
- Job card (vehicle, plate, complaint, mechanic, parts, labour)
- Vehicle history by plate
- Parts stock and sales
- Mechanic work list
- Unpaid jobs

Own tables (prefix `gr_`): `gr_vehicles`, `gr_mechanics`, `gr_job_cards`, `gr_job_parts`, `gr_job_labour`

Server logic:
- Parts used on a job leave stock (reuse core stock tables / `record_sale` pattern)
- Job total = parts + labour; unpaid balance to core `credit_ledger`

Notifications:
- SMS to customer when the car is ready, with amount due

Demo data: 40 vehicles with Ethiopian plate formats, 80 parts, 2 months of job cards. Use fictional names only.

## Daily loop

1. `git pull`. Read `ROADMAP.md`, the last 3 entries of `DAILY_LOG.md`, and `NEEDS_APPROVAL.md` (Alpha writes answers there).
2. Pick the next unchecked ROADMAP items; aim for one meaningful, shippable step per run.
3. Build it. Keep the app building: `npm run build` and `npm run lint` must pass before you commit.
   - UI changes: do FRONTEND.md step 3 (screenshots at 360 and 1280 px in Amharic and English, critique, `web-design-guidelines` review).
   - Database changes: run the cross-tenant RLS test (`supabase/tests/`, extended to your tables) and `get_advisors` (security + performance); paste results in DAILY_LOG.md. A failing test blocks the commit.
   - Every commit: `npm audit --omit=dev` has no high/critical issues and the secret check in SECURITY.md section 3 prints nothing.
4. Commit in small commits with clear messages; push to `main`.
5. Tick finished items in `ROADMAP.md`. Add a dated entry to `DAILY_LOG.md`: what shipped, what is next, blockers.
6. Anything needing Alpha (money, credentials, live payments, core schema changes, design choices) goes in `NEEDS_APPROVAL.md`; never block on it, work on something else.
7. End with a short report: shipped today, next step, anything Alpha must do.

## Never

- Spend money, upgrade plans, or create new Supabase/Vercel projects
- Put secret keys in the frontend or the repo (`.env.local` is gitignored; only the publishable key is public)
- Delete user data, force-push, or rewrite git history
- Use real people's names or photos in demo data
- Add a dependency that is not well known and maintained
